import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { productionApi, ProductionJob } from '../api/production'
import type { Roll } from '../api/procurement'
import { useNotification } from '../contexts/NotificationContext'

import { Layout } from '../components/Layout'
import { DateInput } from '../components/DateInput'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  IN_PRODUCTION: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
}

const MACHINES = ['MC1', 'MC2', 'MC3', 'MC4', 'MC5'] as const

export function ProductionPage() {
  const navigate = useNavigate()
  const notify = useNotification()
  const [jobs, setJobs] = useState<ProductionJob[]>([])
  const [loading, setLoading] = useState(true)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedJob, setSelectedJob] = useState<ProductionJob | null>(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completeJobId, setCompleteJobId] = useState<string | null>(null)
  const [completeJobRolls, setCompleteJobRolls] = useState<Roll[]>([])
  const [consumedRollIds, setConsumedRollIds] = useState<string[]>([])
  const [completeDate, setCompleteDate] = useState(new Date().toISOString().split('T')[0])
  const [showCompleteSuccess, setShowCompleteSuccess] = useState(false)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterCustomer, setFilterCustomer] = useState<string>('')
  const [filterMachine, setFilterMachine] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [sortBy, setSortBy] = useState<'createdAt' | 'jobNumber' | 'customerName' | 'dueDate'>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [searchTerm, setSearchTerm] = useState<string>('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const jobsRes = await productionApi.getJobs()
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : (jobsRes.data as any)?.data || [])
    } catch (err: any) { notify.error(err.message) }
    setLoading(false)
  }

  const handleCompleteJob = async (jobId: string) => {
    setCompleteJobId(jobId)
    setCompleteDate(new Date().toISOString().split('T')[0])
    const job = filteredJobs.find(j => j.id === jobId)
    const parentRolls = (job as any)?.parentRolls || []
    setCompleteJobRolls(parentRolls)
    setConsumedRollIds([])
    setShowCompleteModal(true)
  }

  const confirmCompleteJob = async () => {
    if (!completeJobId) return
    const res = await productionApi.completeJob(completeJobId, completeDate || undefined, consumedRollIds.length > 0 ? consumedRollIds : undefined)
    setShowCompleteModal(false)
    setCompleteJobId(null)
    setCompleteJobRolls([])
    setConsumedRollIds([])
    if (!res.error) {
      notify.success('Job completed successfully')
      loadData()
      setShowCompleteSuccess(true)
    } else {
      notify.error(res.error.message)
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Delete this job?')) return
    const res = await productionApi.deleteJob(jobId)
    if (!res.error) {
      notify.success('Job deleted')
      loadData()
    } else {
      notify.error(res.error.message)
    }
  }

  const openViewModal = (job: ProductionJob) => {
    setSelectedJob(job)
    setShowViewModal(true)
  }

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
      } else if (sortBy === 'dueDate') {
        const dateA = a.salesOrder?.expectedDeliveryDate ? new Date(a.salesOrder.expectedDeliveryDate).getTime() : 0
        const dateB = b.salesOrder?.expectedDeliveryDate ? new Date(b.salesOrder.expectedDeliveryDate).getTime() : 0
        comparison = dateA - dateB
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
          
        </div>

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
              <DateInput
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">To Date</label>
              <DateInput
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
                <option value="createdAt">Created Date</option>
                <option value="dueDate">Due Date</option>
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
              className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Due Date</th>
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
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {job.salesOrder?.expectedDeliveryDate
                        ? new Date(job.salesOrder.expectedDeliveryDate).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-6 py-4">
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
                  <span className="text-slate-500 block text-xs">Total Waste</span>
                  <span className="text-slate-900 font-medium">
                    {(() => {
                      const rw = (selectedJob as any).rollWaste as Record<string, number> | undefined
                      if (rw) return Object.values(rw).reduce((s, v) => s + v, 0).toFixed(2) + ' kg'
                      return (Number(selectedJob.wasteWeight || 0)).toFixed(2) + ' kg'
                    })()}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Due Date</span>
                  <span className="text-slate-900 font-medium">
                    {selectedJob.salesOrder?.expectedDeliveryDate
                      ? new Date(selectedJob.salesOrder.expectedDeliveryDate).toLocaleDateString()
                      : '-'}
                  </span>
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

              {(selectedJob as any).materialOverride && (
                <div className="mb-6 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  <span>Material override: <strong>{(selectedJob as any).materialOverride}</strong></span>
                </div>
              )}

              {/* Parent Rolls */}
              {(selectedJob.parentRolls || (selectedJob.parentRollIds && selectedJob.parentRollIds.length > 0)) && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Parent Rolls Used</h3>
                  <div className="border border-slate-200 rounded-lg">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Roll #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Original Weight</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Waste</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Consumed</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {(() => {
                          const mapping = (selectedJob as any).printedRollMapping as Record<string, any> || {}
                          const contributedMap: Record<string, number> = {}
                          if (selectedJob.printedRolls) {
                            for (const p of selectedJob.printedRolls) {
                              const e = mapping[p.id]
                              if (typeof e === 'object' && e !== null) {
                                for (const [pid, cw] of Object.entries(e)) {
                                  contributedMap[pid] = (contributedMap[pid] || 0) + Number(cw)
                                }
                              }
                            }
                          }
                          const rollWaste = (selectedJob as any).rollWaste as Record<string, number> | undefined
                          return (selectedJob.parentRolls || []).map((pr) => {
                            const consumed = contributedMap[pr.id] ?? (Number(pr.weight) - Number(pr.remainingWeight))
                            const waste = rollWaste?.[pr.id] ?? 0
                            return (
                              <tr key={pr.id}>
                                <td className="px-4 py-2 text-sm text-slate-900">{pr.rollNumber}</td>
                                <td className="px-4 py-2 text-sm text-slate-900">{Number(pr.weight).toFixed(2)} kg</td>
                                <td className="px-4 py-2 text-sm text-slate-900">{waste > 0 ? `${Number(waste).toFixed(2)} kg` : '-'}</td>
                                <td className="px-4 py-2 text-sm text-slate-900">{Number(consumed).toFixed(2)} kg</td>
                                <td className="px-4 py-2 text-sm text-slate-900">{Number(pr.remainingWeight).toFixed(2)} kg</td>
                              </tr>
                            )
                          })
                        })()}
                        {!selectedJob.parentRolls && selectedJob.parentRollIds?.map((id) => (
                          <tr key={id}>
                            <td className="px-4 py-2 text-sm text-slate-900">{id}</td>
                            <td className="px-4 py-2 text-sm text-slate-500">-</td>
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
                <div className="border border-slate-200 rounded-lg">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Roll #</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Weight</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Material</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Parent Roll(s)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedJob.printedRolls?.map((pr, idx) => {
                        const mapping = (selectedJob as any).printedRollMapping as Record<string, any> || {}
                        const entry = mapping[pr.id]
                        let parentInfo: string[] = []
                        if (typeof entry === 'object' && entry !== null) {
                          const parentRollsMap = new Map((selectedJob.parentRolls || []).map(r => [r.id, r]))
                          for (const [parentId, cw] of Object.entries(entry)) {
                            const pr2 = parentRollsMap.get(parentId)
                            const rn = pr2?.rollNumber || parentId
                            parentInfo.push(`${rn}: ${Number(cw).toFixed(2)}kg`)
                          }
                        }
                        return (
                          <tr key={pr.id}>
                            <td className="px-4 py-2 text-sm text-slate-900">{pr.roll?.rollNumber || `Roll ${idx + 1}`}</td>
                            <td className="px-4 py-2 text-sm text-slate-900">{Number(pr.weightUsed).toFixed(2)} kg</td>
                            <td className="px-4 py-2 text-sm text-slate-900">{pr.roll?.material?.subCategory || '-'}</td>
                            <td className="px-4 py-2 text-sm text-slate-600">
                              {parentInfo.length > 0 ? parentInfo.join(', ') : (pr.isCombination ? 'Multiple' : '-')}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                pr.status === 'IN_STOCK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {pr.status || 'IN_STOCK'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {(!selectedJob.printedRolls || selectedJob.printedRolls.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-4 py-4 text-sm text-slate-500 text-center">No printed rolls</td>
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

        {/* Complete Job Modal */}
        {showCompleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Complete Job</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Completion Date</label>
                <DateInput value={completeDate} onChange={e => setCompleteDate(e.target.value)} max={new Date().toISOString().split('T')[0]} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
              </div>
              {completeJobRolls.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Mark rolls as consumed</label>
                  <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-2 space-y-1">
                    {completeJobRolls.map(roll => {
                      const isConsumed = consumedRollIds.includes(roll.id)
                      return (
                        <label key={roll.id} className="flex items-center p-2 hover:bg-slate-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isConsumed}
                            onChange={() => {
                              if (isConsumed) {
                                setConsumedRollIds(consumedRollIds.filter(id => id !== roll.id))
                              } else {
                                setConsumedRollIds([...consumedRollIds, roll.id])
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm">
                            {roll.rollNumber} — {Number(roll.remainingWeight).toFixed(1)}kg
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Check rolls that were fully consumed on the factory floor</p>
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => { setShowCompleteModal(false); setCompleteJobId(null); setCompleteJobRolls([]); setConsumedRollIds([]) }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                <button type="button" onClick={confirmCompleteJob} className="px-4 py-2 bg-green-600 text-white rounded-lg">Complete Job</button>
              </div>
            </div>
          </div>
        )}

        {/* Complete Job - Success Modal */}
        {showCompleteSuccess && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
              <h2 className="text-xl font-bold mb-4">Job Completed</h2>
              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowCompleteSuccess(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Close</button>
                <button type="button" onClick={() => navigate('/inventory?tab=printed-rolls')} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">View Printed Rolls</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
