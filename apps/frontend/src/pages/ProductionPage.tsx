import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { productionApi, ProductionJob, ParentRoll, CreateJobInput } from '../api/production'
import { salesApi } from '../api/sales'
import { Layout } from '../components/Layout'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  IN_PRODUCTION: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
}

const CATEGORIES = ['25microns', '27microns', '28microns', '30microns', 'Premium', 'SuPremium'] as const
const MACHINES = ['MC1', 'MC2', 'MC3', 'MC4', 'MC5'] as const

export function ProductionPage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<ProductionJob[]>([])
  const [availableRolls, setAvailableRolls] = useState<ParentRoll[]>([])
  const [customers, setCustomers] = useState<{id: string, name: string}[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showJobModal, setShowJobModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedJob, setSelectedJob] = useState<ProductionJob | null>(null)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterCustomer, setFilterCustomer] = useState<string>('')
  const [filterMachine, setFilterMachine] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [sortBy, setSortBy] = useState<'createdAt' | 'jobNumber' | 'customerName'>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [searchTerm, setSearchTerm] = useState<string>('')

  const [form, setForm] = useState({
    customerName: '',
    category: '' as typeof CATEGORIES[number] | '',
    machine: '' as typeof MACHINES[number] | '',
    rollIds: [] as string[],
    printedRollWeights: '',
    wasteWeight: 0,
    notes: ''
  })

  const [calculatedWaste, setCalculatedWaste] = useState<number | null>(null)

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (showJobModal && customers.length === 0) {
      salesApi.getCustomers().then(res => {
        const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
        setCustomers(data.map((c: any) => ({ id: c.id, name: c.name })))
      })
    }
  }, [showJobModal])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [jobsRes, customersRes] = await Promise.all([
        productionApi.getJobs(),
        salesApi.getCustomers()
      ])
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : (jobsRes.data as any)?.data || [])
      const custData = Array.isArray(customersRes.data) ? customersRes.data : (customersRes.data as any)?.data || []
      setCustomers(custData.map((c: any) => ({ id: c.id, name: c.name })))
    } catch (err: any) { setError(err.message) }
    setLoading(false)
  }

  const loadAvailableRolls = async (category: string) => {
    if (!category) {
      setAvailableRolls([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await productionApi.getAvailableRolls(category)
      if (res.error) {
        setError(res.error.message || 'Failed to load rolls')
        setAvailableRolls([])
      } else {
        const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
        setAvailableRolls(data)
      }
    } catch (err: any) { 
      setError(err.message || 'Failed to load rolls')
      setAvailableRolls([])
    }
    setLoading(false)
  }

  const handleCategoryChange = (category: typeof CATEGORIES[number]) => {
    setForm({ ...form, category, rollIds: [] })
    loadAvailableRolls(category)
  }

  const toggleRollSelection = (rollId: string) => {
    if (!rollId) return
    const newRollIds = form.rollIds.includes(rollId)
      ? form.rollIds.filter(id => id !== rollId)
      : [...form.rollIds, rollId]
    setForm({ ...form, rollIds: newRollIds })
    setCalculatedWaste(null)
  }

  const calculateWaste = () => {
    const selectedRolls = availableRolls.filter(r => r.id && form.rollIds.includes(r.id))
    if (selectedRolls.length === 0 || !form.printedRollWeights.trim()) return

    const weights = form.printedRollWeights.split(/[\s,]+/).map(w => parseFloat(w)).filter(w => !isNaN(w) && w > 0)
    if (weights.length === 0) return

    const totalParentWeight = selectedRolls.reduce((sum, r) => sum + Number(r.remainingWeight || r.weight || 0), 0)
    const totalPrintedWeight = weights.reduce((sum, w) => sum + w, 0)

    const calculated = totalParentWeight - totalPrintedWeight

    setCalculatedWaste(calculated)
    setForm({ ...form, wasteWeight: calculated })
  }

  const handleCreateJob = async () => {
    if (!form.machine || !form.printedRollWeights.trim()) {
      setError('Please fill in all required fields')
      return
    }

    const weights = form.printedRollWeights.split(/[\s,]+/).map(w => parseFloat(w)).filter(w => !isNaN(w) && w > 0)
    if (weights.length === 0 || weights.length > 35) {
      setError('Enter 1-35 roll weights (space or comma-separated)')
      return
    }

    // Check weight limit
    const selectedRolls = availableRolls.filter(r => r.id && form.rollIds.includes(r.id))
    const totalParentWeight = selectedRolls.reduce((sum, r) => sum + Number(r.remainingWeight || 0), 0)
    const totalPrintedWeight = weights.reduce((sum, w) => sum + w, 0)
    const excessWeight = totalPrintedWeight - totalParentWeight

    if (excessWeight > 10) {
      setError(`Cannot create job: Printed weight (${totalPrintedWeight.toFixed(2)}kg) exceeds available (${totalParentWeight.toFixed(2)}kg) by more than 10kg`)
      return
    }

    if (excessWeight > 0) {
      if (!confirm(`Warning: Printed weight (${totalPrintedWeight.toFixed(2)}kg) exceeds available (${totalParentWeight.toFixed(2)}kg) by ${excessWeight.toFixed(2)}kg. Continue anyway?`)) {
        return
      }
    }

    const input: CreateJobInput = {
      customerName: form.customerName || undefined,
      machine: form.machine,
      category: form.category || undefined,
      rollIds: form.rollIds,
      printedRollWeights: weights,
      wasteWeight: form.wasteWeight || undefined,
      notes: form.notes || undefined
    }

    let res
    if (editingJobId) {
      res = await productionApi.updateJob(editingJobId, input)
    } else {
      res = await productionApi.createJob(input)
    }
    
    if (!res.error) {
      setShowJobModal(false)
      resetForm()
      setEditingJobId(null)
      loadData()
    } else {
      setError(res.error.message)
    }
  }

  const handleCompleteJob = async (jobId: string) => {
    if (!confirm('Complete this job? This will deduct ink/solvents based on customer colors.')) return
    const res = await productionApi.completeJob(jobId)
    if (!res.error) {
      loadData()
      if (confirm('Job completed! View printed rolls in Inventory?')) {
        navigate('/inventory?tab=printed-rolls')
      }
    } else {
      setError(res.error.message)
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Delete this job?')) return
    const res = await productionApi.deleteJob(jobId)
    if (!res.error) {
      loadData()
    } else {
      setError(res.error.message)
    }
  }

  const resetForm = () => {
    setForm({
      customerName: '',
      category: '',
      machine: '',
      rollIds: [],
      printedRollWeights: '',
      wasteWeight: 0,
      notes: ''
    })
    setCalculatedWaste(null)
    setAvailableRolls([])
    setEditingJobId(null)
  }

  const openViewModal = (job: ProductionJob) => {
    setSelectedJob(job)
    setShowViewModal(true)
  }

  const openEditModal = async (job: ProductionJob) => {
    setEditingJobId(job.id)
    const printedWeights = job.printedRolls?.map(pr => pr.weightUsed).join(' ') || ''
    const category = job.printedRolls?.[0]?.roll?.material?.subCategory as typeof CATEGORIES[number] || ''
    
    setForm({
      customerName: job.customerName || '',
      category: category,
      machine: job.machine as typeof MACHINES[number],
      rollIds: job.parentRollIds || [],
      printedRollWeights: printedWeights,
      wasteWeight: Number(job.wasteWeight) || 0,
      notes: job.notes || ''
    })
    
    // Load available rolls for the category
    if (category) {
      loadAvailableRolls(category)
    }
    
    setShowJobModal(true)
  }

  const selectedRolls = availableRolls.filter(r => r.id && form.rollIds.includes(r.id))
  const totalParentWeight = selectedRolls.reduce((sum, r) => sum + Number(r.remainingWeight || r.weight || 0), 0)
  const printedWeights = form.printedRollWeights.split(/[\s,]+/).map(w => parseFloat(w)).filter(w => !isNaN(w) && w > 0)
  const totalPrintedWeight = printedWeights.reduce((sum, w) => sum + w, 0)

  // Filter and sort jobs
  const filteredJobs = useMemo(() => {
    let result = [...jobs]
    
    // Search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(j => 
        j.jobNumber.toLowerCase().includes(term) ||
        j.customerName?.toLowerCase().includes(term) ||
        j.machine.toLowerCase().includes(term)
      )
    }
    
    // Status filter
    if (filterStatus) {
      result = result.filter(j => j.status === filterStatus)
    }
    
    // Customer filter
    if (filterCustomer) {
      result = result.filter(j => j.customerName?.toLowerCase().includes(filterCustomer.toLowerCase()))
    }
    
    // Machine filter
    if (filterMachine) {
      result = result.filter(j => j.machine === filterMachine)
    }
    
    // Date range filter
    if (filterDateFrom) {
      const from = new Date(filterDateFrom)
      result = result.filter(j => new Date(j.createdAt) >= from)
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo)
      to.setHours(23, 59, 59)
      result = result.filter(j => new Date(j.createdAt) <= to)
    }
    
    // Sort
    result.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'createdAt') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else if (sortBy === 'jobNumber') {
        comparison = a.jobNumber.localeCompare(b.jobNumber)
      } else if (sortBy === 'customerName') {
        comparison = (a.customerName || '').localeCompare(b.customerName || '')
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })
    
    return result
  }, [jobs, searchTerm, filterStatus, filterCustomer, filterMachine, filterDateFrom, filterDateTo, sortBy, sortOrder])

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Production</h1>
            <p className="text-slate-500 mt-1">Manage production jobs</p>
          </div>
          <button onClick={() => setShowJobModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">New Job</button>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">{error}</div>}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
              <input
                type="text"
                placeholder="Job #, Customer, Machine..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="IN_PRODUCTION">In Production</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Customer</label>
              <input
                type="text"
                placeholder="Customer name..."
                value={filterCustomer}
                onChange={e => setFilterCustomer(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Machine</label>
              <select
                value={filterMachine}
                onChange={e => setFilterMachine(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">All Machines</option>
                {MACHINES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">From Date</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">To Date</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">Sort by:</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="px-2 py-1 text-sm border border-slate-300 rounded-lg"
              >
                <option value="createdAt">Date</option>
                <option value="jobNumber">Job #</option>
                <option value="customerName">Customer</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <button
              onClick={() => {
                setSearchTerm('')
                setFilterStatus('')
                setFilterCustomer('')
                setFilterMachine('')
                setFilterDateFrom('')
                setFilterDateTo('')
                setSortBy('createdAt')
                setSortOrder('desc')
              }}
              className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900"
            >
              Clear Filters
            </button>
            <span className="text-xs text-slate-500 ml-auto">{filteredJobs.length} of {jobs.length} jobs</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Job #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Machine</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredJobs.map(job => (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{job.jobNumber}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{job.customerName || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{job.machine}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[job.status] || 'bg-slate-100'}`}>{job.status}</span></td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(job.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      {job.status !== 'COMPLETED' && (
                        <button onClick={() => openEditModal(job)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium mr-3">Edit</button>
                      )}
                      <button onClick={() => openViewModal(job)} className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-3">View</button>
                      {job.status === 'IN_PRODUCTION' && (
                        <button onClick={() => handleCompleteJob(job.id)} className="text-green-600 hover:text-green-800 text-sm font-medium mr-3">Complete</button>
                      )}
                      {job.status !== 'COMPLETED' && (
                        <button onClick={() => handleDeleteJob(job.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {jobs.length === 0 && (
              <div className="text-center py-8 text-slate-500">No production jobs yet</div>
            )}
          </div>
        )}

        {/* New Job Modal */}
        {showJobModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">{editingJobId ? 'Edit Production Job' : 'New Production Job'}</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={form.customerName}
                      onChange={e => { setForm({ ...form, customerName: e.target.value }); setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      placeholder="Search customer..."
                    />
                    {showCustomerDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {customers.filter(c => !customerSearch || c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(cust => (
                          <button
                            key={cust.id}
                            type="button"
                            onClick={() => { setForm({ ...form, customerName: cust.name }); setShowCustomerDropdown(false); setCustomerSearch(''); }}
                            className="w-full text-left px-4 py-2 hover:bg-slate-50"
                          >
                            {cust.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Plain Rolls Category *</label>
                    <select
                      value={form.category}
                      onChange={e => handleCategoryChange(e.target.value as typeof CATEGORIES[number])}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="">Select category</option>
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Machine *</label>
                    <select
                      value={form.machine}
                      onChange={e => setForm({ ...form, machine: e.target.value as typeof MACHINES[number] })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="">Select machine</option>
                      {MACHINES.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {form.category && (
                    <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Parent Rolls *</label>
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
                      {loading ? (
                        <p className="text-sm text-slate-500 py-2">Loading...</p>
                      ) : availableRolls.length === 0 ? (
                        <p className="text-sm text-slate-500 py-2">No rolls for this category</p>
                      ) : (
                        availableRolls.filter(r => r && r.id).map((roll, idx) => (
                          <label key={roll.id || `roll-${idx}`} className="flex items-center p-2 hover:bg-slate-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={roll.id ? form.rollIds.includes(roll.id) : false}
                              onChange={() => roll.id && toggleRollSelection(roll.id)}
                              className="mr-3"
                            />
                            <span className="text-sm flex-1">
                              {roll.rollNumber || 'Unknown'} - {Number(roll.weight || 0).toFixed(2)}kg ({roll.material?.subCategory || 'N/A'})
                            </span>
                            <span className="text-xs text-slate-500 mr-2">
                              Remain: {Number(roll.remainingWeight || 0).toFixed(2)}kg
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${roll.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                              {roll.status || 'UNKNOWN'}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    {selectedRolls.length > 0 && (
                      <p className="text-sm text-slate-600 mt-1">Selected: {selectedRolls.length} rolls, {totalParentWeight.toFixed(2)}kg total</p>
                    )}
                  </div>
                )}

                {form.rollIds.length > 0 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Printed Roll Weights (space-separated, kg) - max 35 *
                      </label>
                      <input
                        type="text"
                        value={form.printedRollWeights}
                        onChange={e => { setForm({ ...form, printedRollWeights: e.target.value }); setCalculatedWaste(null); }}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        placeholder="e.g. 14.5 16 18.2 15.8 19.1"
                      />
                      <div className="flex justify-between items-center mt-1">
                        {printedWeights.length > 0 && (
                          <p className="text-sm text-slate-600">
                            {printedWeights.length} rolls, {totalPrintedWeight.toFixed(2)}kg total
                          </p>
                        )}
                        {selectedRolls.length > 0 && (
                          <p className={`text-sm font-medium ${
                            totalParentWeight - totalPrintedWeight < 0 
                              ? 'text-red-600' 
                              : totalParentWeight - totalPrintedWeight < 10 
                                ? 'text-yellow-600' 
                                : 'text-green-600'
                          }`}>
                            {totalParentWeight - totalPrintedWeight >= 0 
                              ? `Remaining: ${(totalParentWeight - totalPrintedWeight).toFixed(2)}kg`
                              : `Exceeded by ${(totalPrintedWeight - totalParentWeight).toFixed(2)}kg`
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Waste Weight (kg)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.wasteWeight || ''}
                          onChange={e => setForm({ ...form, wasteWeight: parseFloat(e.target.value) || 0 })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        />
                        {calculatedWaste !== null && (
                          <p className="text-xs text-slate-500 mt-1">Auto-calculated: {calculatedWaste.toFixed(2)}kg</p>
                        )}
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={calculateWaste}
                          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                        >
                          Calculate Waste
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => { setShowJobModal(false); resetForm(); }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                <button
                  type="button"
                  onClick={handleCreateJob}
                  disabled={!form.machine || form.rollIds.length === 0 || !form.printedRollWeights.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingJobId ? 'Update Job' : 'Create Job'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Job Modal */}
        {showViewModal && selectedJob && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Job: {selectedJob.jobNumber}</h2>
                  <p className="text-sm text-slate-500">Customer: {selectedJob.customerName || '-'}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[selectedJob.status] || 'bg-slate-100'}`}>
                  {selectedJob.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm mb-6">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Machine</span>
                  <span className="text-slate-900 font-medium">{selectedJob.machine}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Total Printed</span>
                  <span className="text-slate-900 font-medium">
                    {selectedJob.printedRolls?.reduce((sum, pr) => sum + Number(pr.weightUsed), 0).toFixed(2) || '0'} kg
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Waste</span>
                  <span className="text-slate-900 font-medium">{Number(selectedJob.wasteWeight || 0).toFixed(2)} kg</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Started</span>
                  <span className="text-slate-900 font-medium">
                    {selectedJob.startDate ? new Date(selectedJob.startDate).toLocaleDateString() : '-'}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Completed</span>
                  <span className="text-slate-900 font-medium">
                    {selectedJob.endDate ? new Date(selectedJob.endDate).toLocaleDateString() : '-'}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Created</span>
                  <span className="text-slate-900 font-medium">
                    {new Date(selectedJob.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Parent Rolls */}
              {(selectedJob.parentRolls || (selectedJob.parentRollIds && selectedJob.parentRollIds.length > 0)) && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Parent Rolls Used</h3>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Roll #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Original Weight</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedJob.parentRolls?.map((pr) => (
                          <tr key={pr.id}>
                            <td className="px-4 py-2 text-sm text-slate-900">{pr.rollNumber}</td>
                            <td className="px-4 py-2 text-sm text-slate-900">{Number(pr.weight).toFixed(2)} kg</td>
                            <td className="px-4 py-2 text-sm text-slate-900">{Number(pr.remainingWeight).toFixed(2)} kg</td>
                          </tr>
                        ))}
                        {!selectedJob.parentRolls && selectedJob.parentRollIds?.map((id) => (
                          <tr key={id}>
                            <td className="px-4 py-2 text-sm text-slate-900">{id}</td>
                            <td className="px-4 py-2 text-sm text-slate-500">-</td>
                            <td className="px-4 py-2 text-sm text-slate-500">-</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Printed Rolls Table */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Printed Rolls ({selectedJob.printedRolls?.length || 0})</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Roll #</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Weight</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Material</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedJob.printedRolls?.map((pr, idx) => (
                        <tr key={pr.id}>
                          <td className="px-4 py-2 text-sm text-slate-900">{pr.roll?.rollNumber || `Roll ${idx + 1}`}</td>
                          <td className="px-4 py-2 text-sm text-slate-900">{Number(pr.weightUsed).toFixed(2)} kg</td>
                          <td className="px-4 py-2 text-sm text-slate-900">{pr.roll?.material?.subCategory || '-'}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              pr.status === 'IN_STOCK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {pr.status || 'IN_STOCK'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(!selectedJob.printedRolls || selectedJob.printedRolls.length === 0) && (
                        <tr>
                          <td colSpan={4} className="px-4 py-4 text-sm text-slate-500 text-center">No printed rolls</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedJob.notes && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <span className="text-yellow-800 text-xs font-medium">Notes:</span>
                  <p className="text-yellow-900 mt-1 text-sm">{selectedJob.notes}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => { setShowViewModal(false); setSelectedJob(null); }} className="px-4 py-2 border border-slate-300 rounded-lg">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
