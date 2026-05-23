import { useState, useEffect } from 'react'
import { procurementApi, PurchaseOrder, SupplierInvoice, SupplierInvoiceStatus } from '../api/procurement'
import { Layout } from '../components/Layout'
import { inventoryApi, MaterialWithStock } from '../api/inventory'
import { suppliersApi, Supplier } from '../api/suppliers'

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  IN_PRODUCTION: 'bg-blue-100 text-blue-800',
  CONSUMED: 'bg-slate-100 text-slate-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  PARTIALLY_RECEIVED: 'bg-orange-100 text-orange-800',
  RECEIVED: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
}

type ItemCategory = 'PLAIN_ROLLS' | 'INK_SOLVENTS' | 'PACKAGING'

interface POLineItemForm {
  materialId: string
  materialName: string
  category: ItemCategory
  quantity: number
  totalWeight: number
  unitPrice: number
  rollWeights: number[]
}

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  PLAIN_ROLLS: 'Plain Rolls',
  INK_SOLVENTS: 'Ink / Solvents',
  PACKAGING: 'Packaging',
}

const SUB_CATEGORIES: Record<ItemCategory, string[]> = {
  PLAIN_ROLLS: ['25microns', '27microns', '28microns', '30microns', 'Premium', 'SuPremium'],
  INK_SOLVENTS: ['IPA', 'Butanol', 'Red-Ink', 'Yellow-Ink', 'White-Ink', 'RoyalBlue-Ink', 'VioletBlue-Ink', 'SkyBlue-Ink'],
  PACKAGING: ['PackingBag'],
}

export function ProcurementPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [materials, setMaterials] = useState<MaterialWithStock[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [newSupplier, setNewSupplier] = useState('')
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPOModal, setShowPOModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [showViewPOModal, setShowViewPOModal] = useState(false)
  const [showEditPOModal, setShowEditPOModal] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [editPOForm, setEditPOForm] = useState({ supplier: '', expectedDate: '', notes: '' })
  const [editLineItems, setEditLineItems] = useState<POLineItemForm[]>([])
  const [editCurrentItem, setEditCurrentItem] = useState({
    category: '' as ItemCategory | '',
    subCategory: '',
    materialId: '',
    quantity: 1,
    totalWeight: 0,
    unitPrice: 0,
    rollWeights: ''
  })

  const [activeTab, setActiveTab] = useState<'pos' | 'invoices'>('pos')
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([])
  const [invoicedPOIds, setInvoicedPOIds] = useState<Set<string>>(new Set())
  const [showInvModal, setShowInvModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<SupplierInvoice | null>(null)
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false)
  const [selectedPaymentHistory, setSelectedPaymentHistory] = useState<SupplierInvoice | null>(null)
  const [poForInv, setPoForInv] = useState<PurchaseOrder | null>(null)
  const [invForm, setInvForm] = useState({ poId: '', invoiceNumber: '', date: '', amount: 0 })
  const [payForm, setPayForm] = useState({ amount: 0, date: '', paymentMethod: 'Cash' as 'Cash' | 'Bank Transfer', reference: '', notes: '' })

  const [poForm, setPoForm] = useState({ supplier: '', expectedDate: '', notes: '' })
  const [poLineItems, setPoLineItems] = useState<POLineItemForm[]>([])
  const [currentItem, setCurrentItem] = useState({
    category: '' as ItemCategory | '',
    subCategory: '',
    materialId: '',
    quantity: 1,
    totalWeight: 0,
    unitPrice: 0,
    rollWeights: ''
  })

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (activeTab === 'invoices') loadSupplierInvoices()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [poRes, matRes, supRes, invRes] = await Promise.all([
        procurementApi.getPOs(),
        inventoryApi.getMaterials(),
        suppliersApi.getAll(),
        procurementApi.getSupplierInvoices()
      ])
      setPurchaseOrders(Array.isArray(poRes.data) ? poRes.data : (poRes.data as any)?.data || [])
      setMaterials(Array.isArray(matRes.data) ? matRes.data : (matRes.data as any)?.data || [])
      setSuppliers(Array.isArray(supRes.data) ? supRes.data : (supRes.data as any)?.data || [])
      const invoices = Array.isArray(invRes.data) ? invRes.data : (invRes.data as any)?.data || []
      setSupplierInvoices(invoices)
      setInvoicedPOIds(new Set(invoices.map((inv: SupplierInvoice) => inv.poId)))
    } catch (err: any) { setError(err.message) }
    setLoading(false)
  }

  const loadSupplierInvoices = async () => {
    try {
      const res = await procurementApi.getSupplierInvoices()
      setSupplierInvoices(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
    } catch (err: any) { setError(err.message) }
  }

  const handleAddSupplier = async () => {
    if (!newSupplier.trim()) return
    const name = newSupplier.trim()
    if (!suppliers.find(s => s.name === name)) {
      const res = await suppliersApi.create({ name })
      if (!res.error) {
        const created = (res.data as any)?.data || res.data
        if (created) {
          setSuppliers([...suppliers, created])
          setPoForm({ ...poForm, supplier: created.name })
        }
      }
    }
    setNewSupplier('')
    setShowSupplierModal(false)
  }

  const handleCreatePO = async () => {
    if (!poForm.supplier.trim()) {
      setError('Supplier is required')
      return
    }
    if (poLineItems.length === 0) {
      setError('Add at least one line item')
      return
    }
    const itemsToSubmit = poLineItems.map(item => ({
      materialId: item.materialId,
      quantity: item.quantity,
      totalWeight: item.totalWeight,
      unitPrice: item.unitPrice,
      rollWeights: item.rollWeights
    }))
    const res = await procurementApi.createPO({ ...poForm, items: itemsToSubmit })
    if (!res.error) {
      setShowPOModal(false)
      setPoForm({ supplier: '', expectedDate: '', notes: '' })
      setPoLineItems([])
      setCurrentItem({ category: '', subCategory: '', materialId: '', quantity: 1, totalWeight: 0, unitPrice: 0, rollWeights: '' })
      loadData()
    } else {
      setError(res.error.message)
    }
  }

  const handleReceivePO = async () => {
    if (!selectedPO) return
    
    const res = await procurementApi.receivePO(selectedPO.id)
    if (!res.error) {
      setShowReceiveModal(false)
      setSelectedPO(null)
      loadData()
    } else {
      setError(res.error.message)
    }
  }

  const handleAddItem = () => {
    if (!currentItem.materialId || currentItem.unitPrice <= 0) {
      setError('Please fill in all required item fields')
      return
    }

    if (currentItem.category === 'PLAIN_ROLLS') {
      const weights = currentItem.rollWeights.split(/[\s,]+/).map(w => parseFloat(w.trim())).filter(w => !isNaN(w) && w > 0)
      if (weights.length === 0 || weights.length > 35) {
        setError('Enter 1-35 roll weights (space or comma-separated, kg)')
        return
      }
      if (poLineItems.length >= 60) {
        setError('Maximum 60 line items allowed')
        return
      }
      const totalWeight = weights.reduce((sum, w) => sum + w, 0)
      const material = materials.find(m => m.id === currentItem.materialId)
      setPoLineItems([...poLineItems, {
        materialId: currentItem.materialId,
        materialName: material?.name || currentItem.materialId,
        category: 'PLAIN_ROLLS',
        quantity: weights.length,
        totalWeight,
        unitPrice: currentItem.unitPrice,
        rollWeights: weights
      }])
    } else if (currentItem.category === 'INK_SOLVENTS') {
      if (poLineItems.length >= 60) {
        setError('Maximum 60 line items allowed')
        return
      }
      const material = materials.find(m => m.id === currentItem.materialId)
      const drumSize = material?.drumSize || 1
      const totalWeight = currentItem.quantity * drumSize
      setPoLineItems([...poLineItems, {
        materialId: currentItem.materialId,
        materialName: material?.name || currentItem.materialId,
        category: 'INK_SOLVENTS',
        quantity: currentItem.quantity,
        totalWeight,
        unitPrice: currentItem.unitPrice,
        rollWeights: []
      }])
    } else if (currentItem.category === 'PACKAGING') {
      if (poLineItems.length >= 60) {
        setError('Maximum 60 line items allowed')
        return
      }
      const material = materials.find(m => m.id === currentItem.materialId)
      const totalWeight = currentItem.quantity
      setPoLineItems([...poLineItems, {
        materialId: currentItem.materialId,
        materialName: material?.name || currentItem.materialId,
        category: 'PACKAGING',
        quantity: currentItem.quantity,
        totalWeight,
        unitPrice: currentItem.unitPrice,
        rollWeights: []
      }])
    }

    setCurrentItem({ category: '', subCategory: '', materialId: '', quantity: 1, totalWeight: 0, unitPrice: 0, rollWeights: '' })
    setError('')
  }

  const handleCategoryChange = (category: ItemCategory) => {
    setCurrentItem({
      ...currentItem,
      category,
      subCategory: '',
      materialId: '',
      unitPrice: 0
    })
  }

  const handleSubCategoryChange = (subCategory: string) => {
    const material = materials.find(m => m.category === currentItem.category && m.subCategory === subCategory)
    setCurrentItem({
      ...currentItem,
      subCategory,
      materialId: material?.id || '',
      unitPrice: material?.costPrice || 0
    })
  }

  const removeLineItem = (index: number) => {
    setPoLineItems(poLineItems.filter((_, i) => i !== index))
  }

  const openReceiveModal = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setShowReceiveModal(true)
  }

  const handleDeletePO = async (poId: string) => {
    if (!confirm('Are you sure you want to delete this PO?')) return
    const res = await procurementApi.deletePO(poId)
    if (!res.error) {
      loadData()
    } else {
      setError(res.error.message)
    }
  }

  const openInvoiceModal = (po?: PurchaseOrder) => {
    setPoForInv(po || null)
    const today = new Date().toISOString().split('T')[0]
    setInvForm({
      poId: po?.id || '',
      invoiceNumber: '',
      date: today,
      amount: po?.totalAmount ? Number(po.totalAmount) : 0
    })
    setShowInvModal(true)
  }

  const handleCreateInvoice = async () => {
    if (!invForm.poId) { setError('Select a purchase order'); return }
    if (invForm.amount <= 0) { setError('Amount must be greater than 0'); return }
    try {
      const res = await procurementApi.createSupplierInvoice({
        poId: invForm.poId,
        date: invForm.date,
        amount: invForm.amount,
        invoiceNumber: invForm.invoiceNumber || undefined
      })
      if (res.error) { setError(res.error.message); return }
      setShowInvModal(false)
      setPoForInv(null)
      setInvoicedPOIds(prev => new Set(prev).add(invForm.poId))
      loadData()
    } catch (err: any) { setError(err.message) }
  }

  const openPaymentModal = (inv: SupplierInvoice) => {
    setSelectedInvoice(inv)
    const today = new Date().toISOString().split('T')[0]
    const balance = Number(inv.amount) - Number(inv.amountPaid)
    setPayForm({ amount: balance > 0 ? balance : 0, date: today, paymentMethod: 'Cash', reference: '', notes: '' })
    setShowPayModal(true)
  }

  const openPaymentHistory = (inv: SupplierInvoice) => {
    setSelectedPaymentHistory(inv)
    setShowPaymentHistoryModal(true)
  }

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return
    if (payForm.amount <= 0) { setError('Payment amount must be greater than 0'); return }
    try {
      const res = await procurementApi.addPayment(selectedInvoice.id, {
        amount: payForm.amount,
        date: payForm.date,
        paymentMethod: payForm.paymentMethod,
        reference: payForm.reference || undefined,
        notes: payForm.notes || undefined
      })
      if (res.error) { setError(res.error.message); return }
      setShowPayModal(false)
      setSelectedInvoice(null)
      loadSupplierInvoices()
    } catch (err: any) { setError(err.message) }
  }

  const openViewPOModal = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setShowViewPOModal(true)
  }

  const openEditPOModal = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setEditPOForm({
      supplier: po.supplier,
      expectedDate: po.expectedDate ? po.expectedDate.split('T')[0] : '',
      notes: po.notes || ''
    })
    setEditLineItems(po.items?.map(item => {
      const mat = materials.find(m => m.id === item.materialId)
      return {
        materialId: item.materialId,
        materialName: item.material?.name || item.materialId,
        category: mat?.category as ItemCategory || 'PLAIN_ROLLS',
        quantity: item.quantity,
        totalWeight: Number(item.totalWeight),
        unitPrice: Number(item.unitPrice),
        rollWeights: (item.rollWeights as number[] || []).length > 0 ? item.rollWeights as number[] : []
      }
    }) || [])
    setEditCurrentItem({ category: '', subCategory: '', materialId: '', quantity: 1, totalWeight: 0, unitPrice: 0, rollWeights: '' })
    setShowEditPOModal(true)
  }

  const handleEditAddItem = () => {
    if (!editCurrentItem.materialId || editCurrentItem.unitPrice <= 0) {
      setError('Please fill in all required item fields')
      return
    }

    if (editCurrentItem.category === 'PLAIN_ROLLS') {
      const weights = editCurrentItem.rollWeights.split(/[\s,]+/).map(w => parseFloat(w.trim())).filter(w => !isNaN(w) && w > 0)
      if (weights.length === 0 || weights.length > 35) {
        setError('Enter 1-35 roll weights (space or comma-separated, kg)')
        return
      }
      if (editLineItems.length >= 60) {
        setError('Maximum 60 line items allowed')
        return
      }
      const totalWeight = weights.reduce((sum, w) => sum + w, 0)
      const material = materials.find(m => m.id === editCurrentItem.materialId)
      setEditLineItems([...editLineItems, {
        materialId: editCurrentItem.materialId,
        materialName: material?.name || editCurrentItem.materialId,
        category: 'PLAIN_ROLLS',
        quantity: weights.length,
        totalWeight,
        unitPrice: editCurrentItem.unitPrice,
        rollWeights: weights
      }])
    } else if (editCurrentItem.category === 'INK_SOLVENTS') {
      if (editLineItems.length >= 60) {
        setError('Maximum 60 line items allowed')
        return
      }
      const material = materials.find(m => m.id === editCurrentItem.materialId)
      const drumSize = material?.drumSize || 1
      const totalWeight = editCurrentItem.quantity * drumSize
      setEditLineItems([...editLineItems, {
        materialId: editCurrentItem.materialId,
        materialName: material?.name || editCurrentItem.materialId,
        category: 'INK_SOLVENTS',
        quantity: editCurrentItem.quantity,
        totalWeight,
        unitPrice: editCurrentItem.unitPrice,
        rollWeights: []
      }])
    } else if (editCurrentItem.category === 'PACKAGING') {
      if (editLineItems.length >= 60) {
        setError('Maximum 60 line items allowed')
        return
      }
      const material = materials.find(m => m.id === editCurrentItem.materialId)
      const totalWeight = editCurrentItem.quantity
      setEditLineItems([...editLineItems, {
        materialId: editCurrentItem.materialId,
        materialName: material?.name || editCurrentItem.materialId,
        category: 'PACKAGING',
        quantity: editCurrentItem.quantity,
        totalWeight,
        unitPrice: editCurrentItem.unitPrice,
        rollWeights: []
      }])
    }

    setEditCurrentItem({ category: '', subCategory: '', materialId: '', quantity: 1, totalWeight: 0, unitPrice: 0, rollWeights: '' })
    setError('')
  }

  const handleEditCategoryChange = (category: ItemCategory) => {
    setEditCurrentItem({
      ...editCurrentItem,
      category,
      subCategory: '',
      materialId: '',
      unitPrice: 0
    })
  }

  const handleEditSubCategoryChange = (subCategory: string) => {
    const material = materials.find(m => m.category === editCurrentItem.category && m.subCategory === subCategory)
    setEditCurrentItem({
      ...editCurrentItem,
      subCategory,
      materialId: material?.id || '',
      unitPrice: material?.costPrice || 0
    })
  }

  const handleSaveEditPO = async () => {
    if (!selectedPO) return

    const res = await procurementApi.updatePO(selectedPO.id, editPOForm)
    if (res.error) {
      setError(res.error.message)
      return
    }

    for (const item of selectedPO.items || []) {
      await procurementApi.removeLineItem(selectedPO.id, item.id)
    }

    for (const item of editLineItems) {
      await procurementApi.addLineItem(selectedPO.id, {
        materialId: item.materialId,
        quantity: item.quantity,
        totalWeight: item.totalWeight,
        unitPrice: item.unitPrice,
        rollWeights: item.rollWeights
      })
    }

    setShowEditPOModal(false)
    loadData()
  }

  const removeEditLineItem = (index: number) => {
    setEditLineItems(editLineItems.filter((_, i) => i !== index))
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Procurement</h1>
            <p className="text-slate-500 mt-1">Manage purchase orders and supplier invoices</p>
          </div>
        </div>

        <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'pos' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Purchase Orders
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'invoices' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Supplier Invoices
          </button>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">{error}</div>}

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : activeTab === 'pos' ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="font-semibold">Purchase Orders</h2>
              <button onClick={() => setShowPOModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">New PO</button>
            </div>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">PO #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Items</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Expected</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {purchaseOrders.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openViewPOModal(po)}>
                    <td className="px-6 py-4 text-sm font-medium text-blue-600 hover:text-blue-800">{po.poNumber}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{po.supplier}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{po.items?.length || 0}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{po.totalAmount ? `$${Number(po.totalAmount).toLocaleString()}` : '-'}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[po.status] || 'bg-slate-100'}`}>{po.status}</span></td>
                    <td className="px-6 py-4 text-sm text-slate-500">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      {po.status === 'PENDING' && (
                        <>
                          <button onClick={() => openReceiveModal(po)} className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-3">Receive</button>
                          <button onClick={() => handleDeletePO(po.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                        </>
                      )}
                      {po.status === 'RECEIVED' && !invoicedPOIds.has(po.id) && (
                        <button onClick={() => openInvoiceModal(po)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Create Invoice</button>
                      )}
                      {po.status === 'RECEIVED' && invoicedPOIds.has(po.id) && (
                        <span className="text-xs text-green-600 font-medium">Invoiced</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="font-semibold">Supplier Invoices</h2>
              <button onClick={() => openInvoiceModal()} className="px-4 py-2 bg-blue-600 text-white rounded-lg">New Invoice</button>
            </div>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Invoice #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">PO #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Paid</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {supplierInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500">No supplier invoices found</td>
                  </tr>
                ) : supplierInvoices.map(inv => {
                  const balance = Number(inv.amount) - Number(inv.amountPaid)
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-blue-600">{inv.invoiceNumber}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{inv.purchaseOrder?.poNumber || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{inv.purchaseOrder?.supplier || inv.supplier?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{new Date(inv.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium">₦{Number(inv.amount).toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 text-right">₦{Number(inv.amountPaid).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          inv.status === 'PAID' ? 'bg-green-100 text-green-800' :
                          inv.status === 'PARTIAL' ? 'bg-orange-100 text-orange-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>{inv.status}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          {inv.payments && inv.payments.length > 0 && (
                            <button onClick={() => openPaymentHistory(inv)} className="text-slate-500 hover:text-slate-700 text-sm font-medium">
                              History ({inv.payments.length})
                            </button>
                          )}
                          {inv.status !== 'PAID' && (
                            <button onClick={() => openPaymentModal(inv)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Record Payment</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {showPOModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">New Purchase Order</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Supplier <span className="text-red-500">*</span></label>
                  <div className="flex space-x-2">
                    <select 
                      value={poForm.supplier} 
                      onChange={e => setPoForm({...poForm, supplier: e.target.value})}
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                    <button 
                      type="button" 
                      onClick={() => setShowSupplierModal(true)}
                      className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                      title="Add new supplier"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expected Date</label>
                  <input type="date" value={poForm.expectedDate} onChange={e => setPoForm({...poForm, expectedDate: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 mb-4">
                <h3 className="font-medium text-slate-900 mb-3">Add Line Item</h3>
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Category</label>
                      <select 
                        value={currentItem.category} 
                        onChange={e => handleCategoryChange(e.target.value as ItemCategory)} 
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      >
                        <option value="">Select category</option>
                        <option value="PLAIN_ROLLS">Plain Rolls</option>
                        <option value="INK_SOLVENTS">Ink / Solvents</option>
                        <option value="PACKAGING">Packaging</option>
                      </select>
                    </div>

                    {currentItem.category && (
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Type</label>
                        <select 
                          value={currentItem.subCategory} 
                          onChange={e => handleSubCategoryChange(e.target.value)} 
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        >
                          <option value="">Select type</option>
                          {currentItem.category === 'PLAIN_ROLLS' && SUB_CATEGORIES.PLAIN_ROLLS.map(sc => (
                            <option key={sc} value={sc}>{sc}</option>
                          ))}
                          {currentItem.category === 'INK_SOLVENTS' && SUB_CATEGORIES.INK_SOLVENTS.map(sc => (
                            <option key={sc} value={sc}>{sc.replace('-', ' ')}</option>
                          ))}
                          {currentItem.category === 'PACKAGING' && SUB_CATEGORIES.PACKAGING.map(sc => (
                            <option key={sc} value={sc}>{sc}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {currentItem.category === 'INK_SOLVENTS' && currentItem.materialId && (
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          {materials.find(m => m.id === currentItem.materialId)?.unitOfMeasure === 'liter' ? 'Drums' : 'Kegs'}
                        </label>
                        <input 
                          type="number" 
                          value={currentItem.quantity || ''} 
                          onChange={e => setCurrentItem({...currentItem, quantity: parseInt(e.target.value) || 0})} 
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" 
                          min="1" 
                          placeholder="0"
                        />
                      </div>
                    )}

                    {currentItem.category === 'PACKAGING' && currentItem.materialId && (
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Bundles</label>
                        <input 
                          type="number" 
                          value={currentItem.quantity || ''} 
                          onChange={e => setCurrentItem({...currentItem, quantity: parseInt(e.target.value) || 0})} 
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" 
                          min="1" 
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>

                  {currentItem.materialId && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          {currentItem.category === 'PACKAGING' ? 'Unit Price ($/bundle)' : 
                           currentItem.category === 'INK_SOLVENTS' ? 
                             (materials.find(m => m.id === currentItem.materialId)?.unitOfMeasure === 'liter' ? 'Unit Price ($/liter)' : 'Unit Price ($/kg)') :
                             'Unit Price ($/kg)'}
                        </label>
                        <input 
                          type="number" 
                          value={currentItem.unitPrice || ''} 
                          onChange={e => setCurrentItem({...currentItem, unitPrice: parseFloat(e.target.value) || 0})} 
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" 
                          step="0.01" 
                          min="0"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}

                  {currentItem.category === 'PLAIN_ROLLS' && currentItem.materialId && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        Individual Roll Weights (space or comma-separated, kg) - max 35 rolls
                      </label>
                      <input 
                        type="text" 
                        value={currentItem.rollWeights} 
                        onChange={e => setCurrentItem({...currentItem, rollWeights: e.target.value})} 
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" 
                        placeholder="e.g. 150.5, 148.2, 152.0, 145.8, 151.3"
                      />
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button 
                      type="button" 
                      onClick={handleAddItem}
                      disabled={
                        !currentItem.materialId || 
                        !currentItem.category ||
                        (currentItem.category === 'PLAIN_ROLLS' ? !currentItem.rollWeights.trim() : currentItem.quantity <= 0) ||
                        currentItem.unitPrice <= 0
                      }
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      + Add to PO
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="font-medium text-slate-900 mb-3">PO Line Items ({poLineItems.length})</h3>
                {poLineItems.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">No items added yet. Use the form above to add items.</p>
                ) : (
                  <table className="min-w-full divide-y divide-slate-200 mb-4">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Material</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Category</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Total</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Unit Price</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Total</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {poLineItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-sm text-slate-900">{item.materialName}</td>
                          <td className="px-3 py-2 text-sm text-slate-500">{CATEGORY_LABELS[item.category]}</td>
                          <td className="px-3 py-2 text-sm text-slate-600 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-sm text-slate-600 text-right">{item.totalWeight.toFixed(2)}</td>
                          <td className="px-3 py-2 text-sm text-slate-600 text-right">{item.unitPrice.toFixed(2)}</td>
                          <td className="px-3 py-2 text-sm text-slate-900 text-right font-medium">${(item.totalWeight * item.unitPrice).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => removeLineItem(idx)} className="text-red-600 hover:text-red-800 text-sm">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-sm font-medium text-slate-900 text-right">Grand Total:</td>
                        <td className="px-3 py-2 text-sm font-bold text-slate-900 text-right">
                          ${poLineItems.reduce((sum, item) => sum + (item.totalWeight * item.unitPrice), 0).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4 mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={poForm.notes} onChange={e => setPoForm({...poForm, notes: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" rows={2} />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => { setShowPOModal(false); setPoLineItems([]); setCurrentItem({ category: '', subCategory: '', materialId: '', quantity: 1, totalWeight: 0, unitPrice: 0, rollWeights: '' }) }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                <button type="button" onClick={handleCreatePO} disabled={poLineItems.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">Create PO</button>
              </div>
            </div>
          </div>
        )}

        {showReceiveModal && selectedPO && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-2">Receive PO: {selectedPO.poNumber}</h2>
              <p className="text-sm text-slate-500 mb-4">This will automatically:</p>
              <ul className="text-sm text-slate-600 space-y-1 mb-4">
                <li>• Create rolls for each line item (avg weight per roll)</li>
                <li>• Add total weight to inventory stock</li>
              </ul>
              
              <div className="bg-slate-50 rounded-lg p-3 mb-4">
                <h3 className="font-medium text-slate-900 mb-2">Summary</h3>
                {selectedPO.items?.map(item => (
                  <div key={item.id} className="flex justify-between text-sm text-slate-600 py-1">
                    <span>{item.material?.name || item.materialId}</span>
                    <span>{item.quantity} rolls × {Number(item.totalWeight).toFixed(2)}kg</span>
                  </div>
                ))}
                <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between font-medium">
                  <span>Total Rolls:</span>
                  <span>{selectedPO.items?.reduce((sum, i) => sum + i.quantity, 0) || 0}</span>
                </div>
              </div>
                
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => { setShowReceiveModal(false); setSelectedPO(null) }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                <button type="button" onClick={handleReceivePO} className="px-4 py-2 bg-green-600 text-white rounded-lg">Receive PO</button>
              </div>
            </div>
          </div>
        )}

        {showViewPOModal && selectedPO && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">PO: {selectedPO.poNumber}</h2>
                  <p className="text-sm text-slate-500">Supplier: {selectedPO.supplier}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[selectedPO.status] || 'bg-slate-100'}`}>{selectedPO.status}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-slate-500">Expected Date:</span>
                  <span className="ml-2 text-slate-900">{selectedPO.expectedDate ? new Date(selectedPO.expectedDate).toLocaleDateString() : '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Total Amount:</span>
                  <span className="ml-2 text-slate-900 font-medium">${selectedPO.totalAmount ? Number(selectedPO.totalAmount).toLocaleString() : '-'}</span>
                </div>
                {selectedPO.receivedDate && (
                  <div>
                    <span className="text-slate-500">Received Date:</span>
                    <span className="ml-2 text-slate-900">{new Date(selectedPO.receivedDate).toLocaleDateString()}</span>
                  </div>
                )}
                {selectedPO.notes && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Notes:</span>
                    <p className="text-slate-900 mt-1">{selectedPO.notes}</p>
                  </div>
                )}
              </div>

              <h3 className="font-medium text-slate-900 mb-2">Line Items</h3>
              <table className="min-w-full divide-y divide-slate-200 mb-4">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Material</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Weight (kg)</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">$/kg</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Total</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {selectedPO.items?.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-sm text-slate-900">{item.material?.name || item.materialId}</td>
                      <td className="px-3 py-2 text-sm text-slate-600 text-right">{Number(item.totalWeight).toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-slate-600 text-right">{Number(item.unitPrice).toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-slate-900 text-right font-medium">${(Number(item.totalWeight) * Number(item.unitPrice)).toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-slate-600 text-right">{item.receivedQty} rolls</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedPO.rolls && selectedPO.rolls.length > 0 && (
                <>
                  <h3 className="font-medium text-slate-900 mb-2">Received Rolls</h3>
                  <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="text-xs text-slate-500">
                          <th className="text-left pb-2">Roll #</th>
                          <th className="text-left pb-2">Material</th>
                          <th className="text-right pb-2">Weight</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedPO.rolls.map((roll: any) => (
                          <tr key={roll.id}>
                            <td className="py-1 text-sm text-slate-700">{roll.rollNumber}</td>
                            <td className="py-1 text-sm text-slate-600">{roll.material?.name || '-'}</td>
                            <td className="py-1 text-sm text-slate-600 text-right">{Number(roll.weight).toFixed(2)} kg</td>
                          </tr>
                        ))}
                        <tr className="font-medium bg-slate-100">
                          <td className="py-1 text-sm" colSpan={2}>Total</td>
                          <td className="py-1 text-sm text-right">{selectedPO.rolls.reduce((sum: number, r: any) => sum + Number(r.weight), 0).toFixed(2)} kg</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => { setShowViewPOModal(false); setSelectedPO(null) }} className="px-4 py-2 border border-slate-300 rounded-lg">Close</button>
                {selectedPO.status === 'PENDING' && (
                  <>
                    <button type="button" onClick={() => { setShowViewPOModal(false); openEditPOModal(selectedPO) }} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Edit</button>
                    <button type="button" onClick={() => { setShowViewPOModal(false); openReceiveModal(selectedPO) }} className="px-4 py-2 bg-green-600 text-white rounded-lg">Receive</button>
                    <button type="button" onClick={() => { setShowViewPOModal(false); handleDeletePO(selectedPO.id) }} className="px-4 py-2 bg-red-600 text-white rounded-lg">Delete</button>
                  </>
                )}
                {selectedPO.status === 'RECEIVED' && !invoicedPOIds.has(selectedPO.id) && (
                  <button type="button" onClick={() => { setShowViewPOModal(false); openInvoiceModal(selectedPO) }} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Create Invoice</button>
                )}
              </div>
            </div>
          </div>
        )}

        {showEditPOModal && selectedPO && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Edit PO: {selectedPO.poNumber}</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
                  <div className="flex space-x-2">
                    <select 
                      value={editPOForm.supplier} 
                      onChange={e => setEditPOForm({...editPOForm, supplier: e.target.value})}
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                    <button 
                      type="button" 
                      onClick={() => setShowSupplierModal(true)}
                      className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                      title="Add new supplier"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expected Date</label>
                  <input type="date" value={editPOForm.expectedDate} onChange={e => setEditPOForm({...editPOForm, expectedDate: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 mb-4">
                <h3 className="font-medium text-slate-900 mb-3">Add Line Item</h3>
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Category</label>
                      <select 
                        value={editCurrentItem.category} 
                        onChange={e => handleEditCategoryChange(e.target.value as ItemCategory)} 
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      >
                        <option value="">Select category</option>
                        <option value="PLAIN_ROLLS">Plain Rolls</option>
                        <option value="INK_SOLVENTS">Ink / Solvents</option>
                        <option value="PACKAGING">Packaging</option>
                      </select>
                    </div>

                    {editCurrentItem.category && (
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Type</label>
                        <select 
                          value={editCurrentItem.subCategory} 
                          onChange={e => handleEditSubCategoryChange(e.target.value)} 
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        >
                          <option value="">Select type</option>
                          {editCurrentItem.category === 'PLAIN_ROLLS' && SUB_CATEGORIES.PLAIN_ROLLS.map(sc => (
                            <option key={sc} value={sc}>{sc}</option>
                          ))}
                          {editCurrentItem.category === 'INK_SOLVENTS' && SUB_CATEGORIES.INK_SOLVENTS.map(sc => (
                            <option key={sc} value={sc}>{sc.replace('-', ' ')}</option>
                          ))}
                          {editCurrentItem.category === 'PACKAGING' && SUB_CATEGORIES.PACKAGING.map(sc => (
                            <option key={sc} value={sc}>{sc}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(editCurrentItem.category === 'INK_SOLVENTS' || editCurrentItem.category === 'PACKAGING') && editCurrentItem.materialId && (
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          {editCurrentItem.category === 'INK_SOLVENTS' ? 
                            (materials.find(m => m.id === editCurrentItem.materialId)?.unitOfMeasure === 'liter' ? 'Drums' : 'Kegs') :
                            'Bundles'}
                        </label>
                        <input 
                          type="number" 
                          value={editCurrentItem.quantity || ''} 
                          onChange={e => setEditCurrentItem({...editCurrentItem, quantity: parseInt(e.target.value) || 0})} 
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" 
                          min="1" 
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>

                  {editCurrentItem.materialId && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          {editCurrentItem.category === 'PACKAGING' ? 'Unit Price ($/bundle)' : 
                           editCurrentItem.category === 'INK_SOLVENTS' ? 
                             (materials.find(m => m.id === editCurrentItem.materialId)?.unitOfMeasure === 'liter' ? 'Unit Price ($/liter)' : 'Unit Price ($/kg)') :
                             'Unit Price ($/kg)'}
                        </label>
                        <input 
                          type="number" 
                          value={editCurrentItem.unitPrice || ''} 
                          onChange={e => setEditCurrentItem({...editCurrentItem, unitPrice: parseFloat(e.target.value) || 0})} 
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" 
                          step="0.01" 
                          min="0"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}

                  {editCurrentItem.category === 'PLAIN_ROLLS' && editCurrentItem.materialId && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        Individual Roll Weights (space or comma-separated, kg) - max 35 rolls
                      </label>
                      <input 
                        type="text" 
                        value={editCurrentItem.rollWeights} 
                        onChange={e => setEditCurrentItem({...editCurrentItem, rollWeights: e.target.value})} 
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" 
                        placeholder="e.g. 150.5, 148.2, 152.0, 145.8, 151.3"
                      />
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button 
                      type="button" 
                      onClick={handleEditAddItem}
                      disabled={
                        !editCurrentItem.materialId || 
                        !editCurrentItem.category ||
                        (editCurrentItem.category === 'PLAIN_ROLLS' ? !editCurrentItem.rollWeights.trim() : editCurrentItem.quantity <= 0) ||
                        editCurrentItem.unitPrice <= 0
                      }
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      + Add to PO
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="font-medium text-slate-900 mb-3">PO Line Items ({editLineItems.length})</h3>
                {editLineItems.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">No items added yet. Use the form above to add items.</p>
                ) : (
                  <table className="min-w-full divide-y divide-slate-200 mb-4">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Material</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Category</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Total</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Unit Price</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Total</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {editLineItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-sm text-slate-900">{item.materialName}</td>
                          <td className="px-3 py-2 text-sm text-slate-500">{CATEGORY_LABELS[item.category]}</td>
                          <td className="px-3 py-2 text-sm text-slate-600 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-sm text-slate-600 text-right">{item.totalWeight.toFixed(2)}</td>
                          <td className="px-3 py-2 text-sm text-slate-600 text-right">{item.unitPrice.toFixed(2)}</td>
                          <td className="px-3 py-2 text-sm text-slate-900 text-right font-medium">${(item.totalWeight * item.unitPrice).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => removeEditLineItem(idx)} className="text-red-600 hover:text-red-800 text-sm">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => { setShowEditPOModal(false); setSelectedPO(null); setEditLineItems([]) }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                <button type="button" onClick={handleSaveEditPO} disabled={editLineItems.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {showSupplierModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
              <h2 className="text-xl font-bold mb-4">Add Supplier</h2>
              <input 
                type="text" 
                value={newSupplier}
                onChange={e => setNewSupplier(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg mb-4"
                placeholder="Supplier name"
                autoFocus
              />
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => { setShowSupplierModal(false); setNewSupplier('') }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                <button type="button" onClick={handleAddSupplier} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Add</button>
              </div>
            </div>
          </div>
        )}

        {showInvModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">New Supplier Invoice</h2>
              <form onSubmit={e => { e.preventDefault(); handleCreateInvoice() }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Order <span className="text-red-500">*</span></label>
                  <select
                    value={invForm.poId}
                    onChange={e => {
                      const po = purchaseOrders.find(p => p.id === e.target.value)
                      setInvForm({ ...invForm, poId: e.target.value, amount: po?.totalAmount ? Number(po.totalAmount) : 0 })
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  >
                    <option value="">Select PO</option>
                    {purchaseOrders.filter(p => p.status === 'RECEIVED').map(po => (
                      <option key={po.id} value={po.id}>{po.poNumber} - {po.supplier}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value={invForm.invoiceNumber}
                    onChange={e => setInvForm({ ...invForm, invoiceNumber: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    placeholder="Leave blank for auto-generate"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={invForm.date}
                    onChange={e => setInvForm({ ...invForm, date: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={invForm.amount}
                    onChange={e => setInvForm({ ...invForm, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">VAT-inclusive amount from supplier invoice</p>
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => { setShowInvModal(false); setPoForInv(null) }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Create Invoice</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showPayModal && selectedInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Record Payment</h2>
              <div className="bg-slate-50 rounded-lg p-4 mb-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Invoice:</span><span className="font-medium">{selectedInvoice.invoiceNumber}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Total Amount:</span><span>₦{Number(selectedInvoice.amount).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Already Paid:</span><span>₦{Number(selectedInvoice.amountPaid).toLocaleString()}</span></div>
                <div className="flex justify-between font-medium border-t border-slate-200 pt-1"><span className="text-slate-500">Balance:</span><span>₦{(Number(selectedInvoice.amount) - Number(selectedInvoice.amountPaid)).toLocaleString()}</span></div>
              </div>
              <form onSubmit={e => { e.preventDefault(); handleRecordPayment() }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payForm.amount}
                    onChange={e => setPayForm({ ...payForm, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={payForm.date}
                    onChange={e => setPayForm({ ...payForm, date: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Paid Via</label>
                  <select
                    value={payForm.paymentMethod}
                    onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value as 'Cash' | 'Bank Transfer' })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reference</label>
                  <input
                    type="text"
                    value={payForm.reference}
                    onChange={e => setPayForm({ ...payForm, reference: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    placeholder="Cheque no., transfer ref, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    value={payForm.notes}
                    onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => { setShowPayModal(false); setSelectedInvoice(null) }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Record Payment</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showPaymentHistoryModal && selectedPaymentHistory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowPaymentHistoryModal(false); setSelectedPaymentHistory(null) }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">Payment History</h2>
                  <p className="text-sm text-slate-500">{selectedPaymentHistory.invoiceNumber} — {selectedPaymentHistory.purchaseOrder?.supplier || selectedPaymentHistory.supplier?.name || '-'}</p>
                </div>
                <button onClick={() => { setShowPaymentHistoryModal(false); setSelectedPaymentHistory(null) }} className="p-1 hover:bg-slate-100 rounded">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {(!selectedPaymentHistory.payments || selectedPaymentHistory.payments.length === 0) ? (
                <p className="text-center text-slate-500 py-8">No payments recorded yet</p>
              ) : (
                <div className="space-y-3">
                  {selectedPaymentHistory.payments.map(p => (
                    <div key={p.id} className="bg-slate-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-lg text-green-700">₦{Number(p.amount).toLocaleString()}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.paymentMethod === 'Bank Transfer' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                        }`}>{p.paymentMethod}</span>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Date:</span>
                          <span>{new Date(p.date).toLocaleDateString()}</span>
                        </div>
                        {p.reference && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Reference:</span>
                            <span className="font-mono text-xs">{p.reference}</span>
                          </div>
                        )}
                        {p.notes && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Notes:</span>
                            <span>{p.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
