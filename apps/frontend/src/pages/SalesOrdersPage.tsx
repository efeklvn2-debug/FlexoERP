import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { salesOrderApi, SalesOrder, PaymentTransaction, Invoice, CustomerBalance, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, DeliveryMethod } from '../api/salesOrders'
import { salesApi, Customer as SalesCustomer } from '../api/sales'
import { pricingApi } from '../api/pricing'
import { settingsApi } from '../api/settings'
import { productionApi, ParentRoll } from '../api/production'
import { Layout } from '../components/Layout'

type TransactionType = 'DEPOSIT' | 'PAYMENT' | 'CORE_BUYBACK' | 'CORE_CREDIT_APPLIED' | 'REFUND'
type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CORE_CREDIT'
type QuantityType = 'rolls' | 'kg'

type Tab = 'orders' | 'payments' | 'invoices' | 'core-buyback' | 'balances' | 'packing-bags'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  MRP_PENDING: 'bg-orange-100 text-orange-800',
  IN_PRODUCTION: 'bg-indigo-100 text-indigo-800',
  READY: 'bg-purple-100 text-purple-800',
  PICKED_UP: 'bg-teal-100 text-teal-800',
  INVOICED: 'bg-cyan-100 text-cyan-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  PENDING_PAYMENT: 'bg-slate-100 text-slate-800',
  PARTIAL_DEPOSIT: 'bg-yellow-100 text-yellow-800',
  DEPOSIT_COMPLETE: 'bg-blue-100 text-blue-800',
  PARTIAL_PAYMENT: 'bg-orange-100 text-orange-800',
  FULLY_PAID: 'bg-green-100 text-green-800',
  OVERPAID: 'bg-purple-100 text-purple-800',
  DRAFT: 'bg-slate-100 text-slate-600',
  ISSUED: 'bg-blue-100 text-blue-800',
  PARTIAL: 'bg-orange-100 text-orange-800',
  PAID: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800'
}

interface MaterialType {
  id: string
  name: string
  code: string
  category: 'PLAIN_ROLLS' | 'INK_SOLVENTS' | 'PACKAGING'
  pricePerKg: number | null
  pricePerPack: number | null
  subCategory?: string
}

export function SalesOrdersPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('orders')
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [payments, setPayments] = useState<PaymentTransaction[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [coreBuybacks, setCoreBuybacks] = useState<any[]>([])
  const [customerBalances, setCustomerBalances] = useState<CustomerBalance[]>([])
  const [customers, setCustomers] = useState<SalesCustomer[]>([])
  const [materials, setMaterials] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [rollWeight, setRollWeight] = useState(15)

  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showCoreBuybackModal, setShowCoreBuybackModal] = useState(false)
  const [showOrderDetails, setShowOrderDetails] = useState<SalesOrder | null>(null)
  const [showCustomerBalance, setShowCustomerBalance] = useState<CustomerBalance | null>(null)
  const [showProductionModal, setShowProductionModal] = useState(false)
  const [showPickupModal, setShowPickupModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null)
  const [productionOrder, setProductionOrder] = useState<SalesOrder | null>(null)
  const [availableRolls, setAvailableRolls] = useState<ParentRoll[]>([])
  const [loadingRolls, setLoadingRolls] = useState(false)

  const [statusFilter, setStatusFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')

  const [orderForm, setOrderForm] = useState({
    customerId: '',
    materialTypeId: '',
    quantityType: 'rolls' as QuantityType,
    quantity: 0,
    unitPrice: 0,
    deliveryMethod: 'PICKUP' as DeliveryMethod,
    shippingAddress: '',
    expectedDeliveryDate: '',
    notes: ''
  })

  const [paymentForm, setPaymentForm] = useState({
    salesOrderId: '',
    customerId: '',
    transactionType: 'DEPOSIT' as TransactionType,
    paymentMethod: 'CASH' as PaymentMethod,
    paymentCategory: 'ROLL' as 'ROLL' | 'BAG' | 'BOTH',
    amount: 0,
    referenceNumber: '',
    notes: ''
  })

  const [coreBuybackForm, setCoreBuybackForm] = useState({
    customerId: '',
    sellerName: '',
    coresQuantity: 0,
    paymentMethod: 'CASH' as PaymentMethod,
    notes: ''
  })

  const [productionForm, setProductionForm] = useState({
    machine: '',
    category: '',
    rollIds: [] as string[],
    printedRollWeights: '',
    wasteWeight: 0,
    notes: ''
  })

  const [calculatedWaste, setCalculatedWaste] = useState<number | null>(null)

  const [pickupForm, setPickupForm] = useState({
    quantityToPickup: 0,
    packingBags: 0,
    packingBagPrice: 0,
    notes: ''
  })

  const [packingBagForm, setPackingBagForm] = useState({
    customerId: '',
    quantity: 0,
    unitPrice: 0,
    paymentMethod: 'CASH' as 'CASH' | 'BANK_TRANSFER',
    referenceNumber: '',
    notes: ''
  })

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      console.log('Loading data...')
      const [ordersRes, customersRes, materialsRes] = await Promise.all([
        salesOrderApi.getOrders(),
        salesApi.getCustomers(),
        pricingApi.getMaterialsWithPrices()
      ])

      console.log('Orders response:', ordersRes)
      console.log('Orders response type:', typeof ordersRes)
      console.log('Orders response.data:', ordersRes?.data)
      
      let ordersData: any[] = []
      if (Array.isArray(ordersRes.data)) {
        ordersData = ordersRes.data
      } else if (ordersRes.data && typeof ordersRes.data === 'object' && 'data' in (ordersRes.data as any)) {
        ordersData = (ordersRes.data as any).data || []
      }
      console.log('Orders loaded:', ordersData.length, ordersData)
      setOrders(ordersData)
      
      setCustomers(Array.isArray(customersRes.data) ? customersRes.data : (customersRes.data as any)?.data || [])
      
      const allMaterials: MaterialType[] = Array.isArray(materialsRes.data) ? materialsRes.data : (materialsRes.data as any)?.data || []
      console.log('All materials:', allMaterials.map(m => ({ name: m.name, category: m.category })))
      const filteredMaterials = allMaterials.filter((m: MaterialType) => 
        m.category !== 'INK_SOLVENTS' && 
        m.category !== 'PACKAGING'
      )
      console.log('Filtered materials:', filteredMaterials.length)
      setMaterials(filteredMaterials)
      
      try {
        const settingsRes = await settingsApi.getSettings()
        if ((settingsRes.data as any)?.rollWeight) {
          setRollWeight(Number((settingsRes.data as any).rollWeight) || 15)
        }
      } catch {
        console.log('Settings not available, using default roll weight')
      }
    } catch (err: any) {
      console.error('Load data error:', err)
      setError(err.message || 'Failed to load orders')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const handleFocus = () => loadData()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  const loadPayments = async () => {
    try {
      const res = await salesOrderApi.getPayments()
      setPayments(Array.isArray(res.data) ? res.data : [])
    } catch (err: any) {
      console.error('Failed to load payments:', err)
    }
  }

  const loadInvoices = async () => {
    try {
      const res = await salesOrderApi.getInvoices()
      setInvoices(Array.isArray(res.data) ? res.data : [])
    } catch (err: any) {
      console.error('Failed to load invoices:', err)
    }
  }

  const loadCoreBuybacks = async () => {
    try {
      const res = await salesOrderApi.getCoreBuybacks()
      console.log('Core buybacks response:', res)
      let buybacks: any[] = []
      if (Array.isArray(res.data)) {
        buybacks = res.data
      } else if (res.data && typeof res.data === 'object' && 'data' in (res.data as any)) {
        buybacks = (res.data as any).data || []
      }
      console.log('Core buybacks loaded:', buybacks.length, buybacks)
      setCoreBuybacks(buybacks)
    } catch (err: any) {
      console.error('Failed to load core buybacks:', err)
    }
  }

  const loadCustomerBalances = async () => {
    try {
      const res = await salesOrderApi.getAllCustomerBalances()
      setCustomerBalances(Array.isArray(res.data) ? res.data : [])
    } catch (err: any) {
      console.error('Failed to load customer balances:', err)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab === 'payments') loadPayments()
    if (activeTab === 'invoices') loadInvoices()
    if (activeTab === 'core-buyback') loadCoreBuybacks()
    if (activeTab === 'balances') loadCustomerBalances()
  }, [activeTab])

  const filteredOrders = orders.filter(o => {
    if (statusFilter && o.status !== statusFilter) return false
    if (customerFilter && o.customerId !== customerFilter) return false
    return true
  })

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!orderForm.customerId) { setError('Customer is required'); return }
    if (!orderForm.materialTypeId) { setError('Material type is required'); return }
    if (!orderForm.quantity || orderForm.quantity <= 0) { setError('Quantity is required'); return }
    if (!orderForm.unitPrice || orderForm.unitPrice <= 0) { setError('Unit price is required'); return }

    const quantityOrdered = orderForm.quantityType === 'rolls' 
      ? orderForm.quantity * rollWeight 
      : orderForm.quantity

    const selectedMaterial = materials.find(m => m.id === orderForm.materialTypeId)
    const specsJson = {
      materialType: selectedMaterial?.subCategory || selectedMaterial?.name || orderForm.materialTypeId,
      materialCode: selectedMaterial?.code || '',
      quantityInUnits: orderForm.quantity,
      quantityType: orderForm.quantityType,
      notes: orderForm.notes || undefined
    }

    console.log('Creating order with:', { customerId: orderForm.customerId, specsJson, quantityOrdered, unitPrice: orderForm.unitPrice })

    try {
      const res = await salesOrderApi.createOrder({
        customerId: orderForm.customerId,
        specsJson,
        quantityOrdered,
        unitPrice: orderForm.unitPrice,
        deliveryMethod: orderForm.deliveryMethod,
        shippingAddress: orderForm.shippingAddress || undefined
      })
      console.log('Order response:', res)
      if (res.error) { 
        setError(res.error.message); 
        return 
      }
      setShowOrderModal(false)
      setOrderForm({ customerId: '', materialTypeId: '', quantityType: 'rolls', quantity: 0, unitPrice: 0, deliveryMethod: 'PICKUP', shippingAddress: '', expectedDeliveryDate: '', notes: '' })
      loadData()
    } catch (err: any) {
      console.error('Create order error:', err)
      setError(err.message || 'Failed to create order')
    }
  }

  const handleMaterialChange = (materialId: string) => {
    const material = materials.find(m => m.id === materialId)
    setOrderForm({
      ...orderForm,
      materialTypeId: materialId,
      unitPrice: material?.pricePerKg || 0
    })
  }

  const quantityInKg = orderForm.quantityType === 'rolls' 
    ? orderForm.quantity * rollWeight 
    : orderForm.quantity
  const orderTotal = quantityInKg * orderForm.unitPrice

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!paymentForm.amount || paymentForm.amount <= 0) { setError('Amount is required'); return }
    if (!paymentForm.customerId) { setError('Customer is required'); return }

    try {
      const res = await salesOrderApi.recordPayment({
        salesOrderId: paymentForm.salesOrderId || undefined,
        customerId: paymentForm.customerId,
        transactionType: paymentForm.transactionType,
        paymentMethod: paymentForm.paymentMethod,
        paymentCategory: paymentForm.paymentCategory,
        amount: paymentForm.amount,
        referenceNumber: paymentForm.referenceNumber || undefined,
        notes: paymentForm.notes || undefined
      })
      if (res.error) { setError(res.error.message); return }
      setShowPaymentModal(false)
      setPaymentForm({ salesOrderId: '', customerId: '', transactionType: 'DEPOSIT', paymentMethod: 'CASH', paymentCategory: 'ROLL', amount: 0, referenceNumber: '', notes: '' })
      loadData()
      loadPayments()
    } catch (err: any) {
      setError(err.message || 'Failed to record payment')
    }
  }

  const handlePackingBagSale = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!packingBagForm.customerId) { setError('Customer is required'); return }
    if (packingBagForm.quantity <= 0) { setError('Quantity must be greater than 0'); return }
    if (packingBagForm.unitPrice <= 0) { setError('Unit price must be greater than 0'); return }

    try {
      const res = await salesOrderApi.sellPackingBags({
        customerId: packingBagForm.customerId,
        quantity: packingBagForm.quantity,
        unitPrice: packingBagForm.unitPrice,
        paymentMethod: packingBagForm.paymentMethod,
        referenceNumber: packingBagForm.referenceNumber || undefined,
        notes: packingBagForm.notes || undefined
      })
      
      if (res.error) { 
        setError(res.error.message); 
        return 
      }
      
      alert(`Packing bag sale recorded!\nQuantity: ${packingBagForm.quantity} bags\nTotal: ₦${(packingBagForm.quantity * packingBagForm.unitPrice).toLocaleString()}`)
      
      setPackingBagForm({
        customerId: '',
        quantity: 0,
        unitPrice: 0,
        paymentMethod: 'CASH',
        referenceNumber: '',
        notes: ''
      })
      
      loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to record packing bag sale')
    }
  }

  const handleRecordCoreBuyback = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!coreBuybackForm.coresQuantity || coreBuybackForm.coresQuantity <= 0) { setError('Core quantity is required'); return }
    if (!coreBuybackForm.customerId && !coreBuybackForm.sellerName) { setError('Customer or seller name is required'); return }

    console.log('Recording core buyback:', coreBuybackForm)

    try {
      const res = await salesOrderApi.recordCoreBuyback({
        customerId: coreBuybackForm.customerId || undefined,
        sellerName: coreBuybackForm.sellerName || undefined,
        coresQuantity: coreBuybackForm.coresQuantity,
        paymentMethod: coreBuybackForm.paymentMethod,
        notes: coreBuybackForm.notes || undefined
      })
      console.log('Core buyback response:', res)
      if (res.error) { setError(res.error.message); return }
      setShowCoreBuybackModal(false)
      setCoreBuybackForm({ customerId: '', sellerName: '', coresQuantity: 0, paymentMethod: 'CASH', notes: '' })
      loadCoreBuybacks()
      loadData()
    } catch (err: any) {
      console.error('Core buyback error:', err)
      setError(err.message || 'Failed to record core buyback')
    }
  }

  const handleOrderAction = async (orderId: string, action: 'approve' | 'cancel' | 'ready' | 'pickup' | 'startProduction', order?: SalesOrder) => {
    try {
      if (action === 'startProduction' && order) {
        openProductionModal(order)
        return
      }
      let res
      switch (action) {
        case 'approve': res = await salesOrderApi.approveOrder(orderId); break
        case 'cancel': res = await salesOrderApi.cancelOrder(orderId); break
        case 'ready': res = await salesOrderApi.markReady(orderId); break
        case 'pickup': res = await salesOrderApi.recordPickup(orderId); break
      }
      if (res?.error) { setError(res.error.message); return }
      loadData()
      if (showOrderDetails?.id === orderId) {
        const updated = await salesOrderApi.getOrderById(orderId)
        const order = (updated.data as any)?.data || updated.data
        if (order) setShowOrderDetails(order)
      }
    } catch (err: any) {
      setError(err.message || `Failed to ${action} order`)
    }
  }

  const handleCreateInvoice = async (orderId: string) => {
    try {
      const res = await salesOrderApi.createInvoice({ salesOrderId: orderId })
      if (res.error) { setError(res.error.message); return }
      const invoice = (res.data as any)?.data || res.data
      if (invoice) {
        setCurrentInvoice(invoice)
        setShowInvoiceModal(true)
        loadInvoices()
        loadData()
        if (showOrderDetails?.id === orderId) {
          const updated = await salesOrderApi.getOrderById(orderId)
          const order = (updated.data as any)?.data || updated.data
          if (order) setShowOrderDetails(order)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice')
    }
  }

  const loadAvailableRolls = async (category?: string) => {
    setLoadingRolls(true)
    try {
      const res = await productionApi.getAvailableRolls(category)
      if (res.error) {
        console.error('Failed to load rolls:', res.error)
        setAvailableRolls([])
      } else {
        const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
        setAvailableRolls(data)
      }
    } catch (err: any) {
      console.error('Failed to load rolls:', err)
      setAvailableRolls([])
    }
    setLoadingRolls(false)
  }

  const calculateWaste = () => {
    const selectedRollsData = availableRolls.filter(r => productionForm.rollIds.includes(r.id))
    if (selectedRollsData.length === 0 || !productionForm.printedRollWeights.trim()) {
      setCalculatedWaste(null)
      return
    }

    const weights = productionForm.printedRollWeights.split(/[\s,]+/)
      .map(w => parseFloat(w))
      .filter(w => !isNaN(w) && w > 0)

    if (weights.length === 0) {
      setCalculatedWaste(null)
      return
    }

    const totalParentWeight = selectedRollsData.reduce((sum, r) => sum + Number(r.remainingWeight || 0), 0)
    const totalPrintedWeight = weights.reduce((sum, w) => sum + w, 0)
    const calculated = totalParentWeight - totalPrintedWeight

    setCalculatedWaste(calculated)
  }

  const openProductionModal = async (order: SalesOrder) => {
    setProductionOrder(order)
    setProductionForm({
      machine: '',
      category: '',
      rollIds: [],
      printedRollWeights: '',
      wasteWeight: 0,
      notes: ''
    })
    setCalculatedWaste(null)
    await loadAvailableRolls()
    setShowProductionModal(true)
  }

  const openPickupModal = (order: SalesOrder) => {
    setProductionOrder(order)
    const producedQty = Number(order.quantityProduced || 0)
    const alreadyDelivered = Number(order.quantityDelivered || 0)
    const remainingQty = producedQty - alreadyDelivered
    
    const pbagMaterial = materials.find((m: any) => m.code === 'PBAG')
    const defaultPrice = pbagMaterial?.pricePerPack || 0
    
    setPickupForm({
      quantityToPickup: remainingQty,
      packingBags: 0,
      packingBagPrice: defaultPrice,
      notes: ''
    })
    setShowPickupModal(true)
  }

  const handleStartProduction = async () => {
    if (!productionOrder) return
    if (!productionForm.machine) { setError('Machine is required'); return }
    if (productionForm.rollIds.length === 0) { setError('Select at least one parent roll'); return }

    const weights = productionForm.printedRollWeights.split(/[\s,]+/)
      .map(w => parseFloat(w))
      .filter(w => !isNaN(w) && w > 0)

    if (weights.length === 0 || weights.length > 35) {
      setError('Enter 1-35 roll weights (space or comma-separated)')
      return
    }

    const selectedRollsData = availableRolls.filter(r => productionForm.rollIds.includes(r.id))
    const totalParentWeight = selectedRollsData.reduce((sum, r) => sum + Number(r.remainingWeight || 0), 0)
    const totalPrintedWeight = weights.reduce((sum, w) => sum + w, 0)
    const excessWeight = totalPrintedWeight - totalParentWeight

    if (excessWeight > 10) {
      setError(`Cannot create job: Printed weight exceeds available by more than 10kg`)
      return
    }

    if (excessWeight > 0) {
      if (!confirm(`Warning: Printed weight exceeds available by ${excessWeight.toFixed(2)}kg. Continue anyway?`)) {
        return
      }
    }

    try {
      const res = await salesOrderApi.startProduction(productionOrder.id, {
        machine: productionForm.machine,
        category: productionForm.category || undefined,
        rollIds: productionForm.rollIds,
        printedRollWeights: weights,
        wasteWeight: productionForm.wasteWeight || undefined,
        notes: productionForm.notes || undefined
      })
      if (res.error) { setError(res.error.message); return }
      setShowProductionModal(false)
      setProductionOrder(null)
      setCalculatedWaste(null)
      loadData()
      if (showOrderDetails?.id === productionOrder.id) {
        const updated = await salesOrderApi.getOrderById(productionOrder.id)
        const order = (updated.data as any)?.data || updated.data
        if (order) setShowOrderDetails(order)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start production')
    }
  }

  const handleRecordPickup = async () => {
    if (!productionOrder) return
    if (pickupForm.quantityToPickup <= 0) { setError('Quantity must be greater than 0'); return }

    try {
      const res = await salesOrderApi.recordPickup(
        productionOrder.id, 
        pickupForm.quantityToPickup,
        pickupForm.packingBags > 0 ? pickupForm.packingBags : undefined
      )
      if (res.error) { setError(res.error.message); return }
      setShowPickupModal(false)
      setProductionOrder(null)
      loadData()
      if (showOrderDetails?.id === productionOrder.id) {
        const updated = await salesOrderApi.getOrderById(productionOrder.id)
        const order = (updated.data as any)?.data || updated.data
        if (order) setShowOrderDetails(order)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to record pickup')
    }
  }

  const getAvailableActions = (order: SalesOrder) => {
    const actions: { label: string; action: string; variant: string }[] = []
    switch (order.status) {
      case 'PENDING':
        actions.push({ label: 'Approve', action: 'approve', variant: 'bg-green-600 hover:bg-green-700' })
        actions.push({ label: 'Cancel', action: 'cancel', variant: 'bg-red-600 hover:bg-red-700' })
        break
      case 'APPROVED':
      case 'MRP_PENDING':
        actions.push({ label: 'Start Production', action: 'startProduction', variant: 'bg-indigo-600 hover:bg-indigo-700' })
        actions.push({ label: 'Cancel', action: 'cancel', variant: 'bg-red-600 hover:bg-red-700' })
        break
      case 'IN_PRODUCTION':
        actions.push({ label: 'Go to Production', action: 'viewProduction', variant: 'bg-indigo-600 hover:bg-indigo-700' })
        break
      case 'READY':
        actions.push({ label: 'Record Pickup', action: 'pickup', variant: 'bg-teal-600 hover:bg-teal-700' })
        break
      case 'PICKED_UP':
        actions.push({ label: 'Create Invoice', action: 'invoice', variant: 'bg-blue-600 hover:bg-blue-700' })
        break
    }
    return actions
  }

  const openPaymentModal = (order?: SalesOrder) => {
    setPaymentForm({
      salesOrderId: order?.id || '',
      customerId: order?.customerId || '',
      transactionType: 'PAYMENT',
      paymentMethod: 'CASH',
      paymentCategory: 'ROLL',
      amount: order ? order.totalAmount - order.totalPaid : 0,
      referenceNumber: '',
      notes: ''
    })
    setShowPaymentModal(true)
  }

  const coreBuybackValue = coreBuybackForm.coresQuantity * 150

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">MTO Sales Orders</h1>
            <p className="text-slate-500 mt-1">Make-to-Order workflow management</p>
          </div>
          <div className="flex space-x-3">
            <button onClick={() => setShowOrderModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              + New Order
            </button>
            <button onClick={() => setShowCoreBuybackModal(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              Core Buyback
            </button>
          </div>
        </div>

        <div className="flex space-x-2 border-b border-slate-200">
          {(['orders', 'payments', 'invoices', 'core-buyback', 'balances', 'packing-bags'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'core-buyback' ? 'Core Buybacks' : tab === 'packing-bags' ? 'Packing Bags' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">{error}</div>}

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <>
            {activeTab === 'orders' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <div className="flex gap-4 flex-wrap">
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
                      <option value="">All Statuses</option>
                      <option value="PENDING">Pending</option>
                      <option value="APPROVED">Approved</option>
                      <option value="MRP_PENDING">Awaiting Materials</option>
                      <option value="IN_PRODUCTION">In Production</option>
                      <option value="READY">Ready for Pickup</option>
                      <option value="PICKED_UP">Picked Up</option>
                      <option value="INVOICED">Invoiced</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                    <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
                      <option value="">All Customers</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Order #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Qty (Ord → Del)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Payment</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Total</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Paid</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredOrders.length === 0 ? (
                        <tr><td colSpan={9} className="px-6 py-8 text-center text-slate-500">No orders found</td></tr>
                      ) : (
                        filteredOrders.map(o => (
                          <tr key={o.id} className={`hover:bg-slate-50 cursor-pointer ${o.status === 'CANCELLED' ? 'line-through text-slate-400' : ''}`} onClick={async () => {
                            const updated = await salesOrderApi.getOrderById(o.id)
                            const order = (updated.data as any)?.data || updated.data
                            if (order) setShowOrderDetails(order)
                            else setShowOrderDetails(o)
                          }}>
                            <td className="px-6 py-4 text-sm font-medium text-slate-900">{o.orderNumber}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{o.customer?.name || '-'}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-slate-100'}`}>
                                {ORDER_STATUS_LABELS[o.status] || o.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span className="text-slate-900">{Number(o.quantityOrdered).toFixed(1)}</span>
                              <span className="text-slate-400 mx-1">→</span>
                              <span className="text-teal-600 font-medium">{Number(o.quantityDelivered || 0).toFixed(1)}</span>
                              <span className="text-slate-400 text-xs ml-1">kg</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[o.paymentStatus] || 'bg-slate-100'}`}>
                                {PAYMENT_STATUS_LABELS[o.paymentStatus] || o.paymentStatus}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-900 text-right">₦{Number(o.totalAmount).toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm text-green-600 text-right">₦{Number(o.totalPaid).toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                            <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                              <div className="flex space-x-2">
                                {getAvailableActions(o).map(a => (
                                  <button
                                    key={a.action}
                                    onClick={() => {
                                      if (a.action === 'invoice') handleCreateInvoice(o.id)
                                      else if (a.action === 'startProduction') handleOrderAction(o.id, a.action as any, o)
                                      else if (a.action === 'pickup') openPickupModal(o)
                                      else if (a.action === 'viewProduction') navigate('/production')
                                      else handleOrderAction(o.id, a.action as any)
                                    }}
                                    className={`px-2 py-1 text-white text-xs rounded ${a.variant}`}
                                  >
                                    {a.label}
                                  </button>
                                ))}
                                {['PICKED_UP', 'INVOICED'].includes(o.status) && o.paymentStatus !== 'FULLY_PAID' && o.paymentStatus !== 'OVERPAID' && (
                                  <button onClick={() => openPaymentModal(o)} className="px-2 py-1 bg-slate-600 text-white text-xs rounded hover:bg-slate-700">
                                    Pay
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                  <h2 className="font-semibold">Payment Transactions</h2>
                  <button onClick={() => openPaymentModal()} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    + Record Payment
                  </button>
                </div>
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payments.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No payments found</td></tr>
                    ) : (
                      payments.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-600">{new Date(p.receivedAt).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              p.transactionType === 'DEPOSIT' ? 'bg-blue-100 text-blue-800' :
                              p.transactionType === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                              p.transactionType === 'CORE_CREDIT_APPLIED' ? 'bg-purple-100 text-purple-800' :
                              p.transactionType === 'REFUND' ? 'bg-red-100 text-red-800' :
                              'bg-slate-100 text-slate-800'
                            }`}>
                              {p.transactionType.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{p.customer?.name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{p.paymentMethod}</td>
                          <td className="px-6 py-4 text-sm font-medium text-green-600 text-right">₦{Number(p.amount).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{p.referenceNumber || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'invoices' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Invoice #</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Rolls</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Bags</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoices.length === 0 ? (
                      <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-500">No invoices found</td></tr>
                    ) : (
                      invoices.map(inv => (
                        <tr key={inv.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{inv.invoiceNumber}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{inv.customer?.name || '-'}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] || 'bg-slate-100'}`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 text-right">{inv.quantityDelivered?.toFixed(1)} kg</td>
                          <td className="px-6 py-4 text-sm text-slate-600 text-right">{inv.packingBagsQuantity || 0} bags</td>
                          <td className="px-6 py-4 text-sm text-slate-900 text-right">₦{Number(inv.totalAmount).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-red-600 text-right">₦{Number(inv.balanceDue).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'core-buyback' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                  <h2 className="font-semibold">Core Buybacks</h2>
                  <button onClick={() => setShowCoreBuybackModal(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                    + New Buyback
                  </button>
                </div>
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer/Seller</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Cores</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Rate</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Total</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {coreBuybacks.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No core buybacks found</td></tr>
                    ) : (
                      coreBuybacks.map(cb => (
                        <tr key={cb.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-600">{new Date(cb.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{cb.customer?.name || cb.sellerName || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-900 text-right">{cb.coresQuantity}</td>
                          <td className="px-6 py-4 text-sm text-slate-600 text-right">₦{Number(cb.ratePerCore).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm font-medium text-purple-600 text-right">₦{Number(cb.totalValue).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{cb.paymentMethod}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'balances' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Outstanding</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Deposit Held</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Core Credit</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Available Credit</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {customerBalances.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No customer balances found</td></tr>
                    ) : (
                      customerBalances.map(cb => (
                        <tr key={cb.customerId} className="hover:bg-slate-50 cursor-pointer" onClick={() => setShowCustomerBalance(cb)}>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{cb.customerName}</td>
                          <td className="px-6 py-4 text-sm text-red-600 text-right">₦{Number(cb.totalOutstanding).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-blue-600 text-right">₦{Number(cb.depositHeld).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-purple-600 text-right">₦{Number(cb.coreCreditBalance).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-green-600 text-right">₦{Number(cb.availableCredit).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-slate-600 text-center">{cb.ordersCount}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'packing-bags' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Sell Packing Bags</h3>
                  <form onSubmit={handlePackingBagSale} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
                      <select 
                        value={packingBagForm.customerId} 
                        onChange={e => setPackingBagForm({...packingBagForm, customerId: e.target.value})} 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        required
                      >
                        <option value="">Select Customer</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Quantity (bundles)</label>
                        <input
                          type="number"
                          min="1"
                          value={packingBagForm.quantity || ''}
                          onChange={e => setPackingBagForm({...packingBagForm, quantity: parseInt(e.target.value) || 0})}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Unit Price (₦)</label>
                        <input
                          type="number"
                          min="1"
                          value={packingBagForm.unitPrice || ''}
                          onChange={e => setPackingBagForm({...packingBagForm, unitPrice: parseFloat(e.target.value) || 0})}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                          required
                        />
                      </div>
                    </div>

                    {packingBagForm.quantity > 0 && packingBagForm.unitPrice > 0 && (
                      <div className="p-3 bg-teal-50 rounded-lg border border-teal-200">
                        <p className="text-sm text-teal-800">
                          <strong>Total:</strong> ₦{(packingBagForm.quantity * packingBagForm.unitPrice).toLocaleString()}
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                      <select 
                        value={packingBagForm.paymentMethod} 
                        onChange={e => setPackingBagForm({...packingBagForm, paymentMethod: e.target.value as 'CASH' | 'BANK_TRANSFER'})} 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      >
                        <option value="CASH">Cash</option>
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
                      <input
                        type="text"
                        value={packingBagForm.referenceNumber}
                        onChange={e => setPackingBagForm({...packingBagForm, referenceNumber: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        placeholder="Optional"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                      <textarea
                        value={packingBagForm.notes}
                        onChange={e => setPackingBagForm({...packingBagForm, notes: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        rows={2}
                        placeholder="Optional notes..."
                      />
                    </div>

                    <button type="submit" className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">
                      Record Sale
                    </button>
                  </form>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Stock Info</h3>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">Current packing bag stock can be viewed in the Inventory page under Cores & Packaging tab.</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* New Order Modal */}
        {showOrderModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">New Sales Order</h2>
              <form onSubmit={handleCreateOrder} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer <span className="text-red-500">*</span></label>
                  <select value={orderForm.customerId} onChange={e => setOrderForm({...orderForm, customerId: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required>
                    <option value="">Select customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Material Type <span className="text-red-500">*</span></label>
                  <select value={orderForm.materialTypeId} onChange={e => handleMaterialChange(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required>
                    <option value="">Select material</option>
                    {materials.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.subCategory ? `(${m.subCategory})` : ''} - {m.code} {m.pricePerKg ? `(₦${m.pricePerKg}/kg)` : '(No price)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOrderForm({...orderForm, quantityType: 'rolls'})}
                        className={`px-3 py-2 text-sm ${orderForm.quantityType === 'rolls' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        Rolls
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderForm({...orderForm, quantityType: 'kg'})}
                        className={`px-3 py-2 text-sm ${orderForm.quantityType === 'kg' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        kg
                      </button>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={orderForm.quantity || ''}
                      onChange={e => setOrderForm({...orderForm, quantity: parseInt(e.target.value) || 0})}
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg"
                      placeholder={orderForm.quantityType === 'rolls' ? 'Number of rolls' : 'Weight in kg'}
                      required
                    />
                  </div>
                  {orderForm.quantity > 0 && (
                    <p className="text-sm text-slate-500 mt-1">
                      = {orderForm.quantityType === 'rolls' 
                        ? `${orderForm.quantity} rolls ≈ ${orderForm.quantity * rollWeight} kg`
                        : `${orderForm.quantity} kg ≈ ${Math.ceil(orderForm.quantity / rollWeight)} rolls`
                      }
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Unit Price (₦/kg) <span className="text-red-500">*</span>
                    <span className="text-slate-400 text-xs ml-1">(auto-populated, can adjust)</span>
                  </label>
                  <input type="number" min="0" step="0.01" value={orderForm.unitPrice || ''} onChange={e => setOrderForm({...orderForm, unitPrice: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required />
                </div>

                {orderTotal > 0 && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-green-800">Order Total:</span>
                      <span className="text-lg font-bold text-green-700">₦{orderTotal.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-green-600 mt-1">({quantityInKg} kg × ₦{orderForm.unitPrice}/kg)</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expected Delivery Date</label>
                  <input type="date" value={orderForm.expectedDeliveryDate} onChange={e => setOrderForm({...orderForm, expectedDeliveryDate: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Delivery Method</label>
                  <select value={orderForm.deliveryMethod} onChange={e => setOrderForm({...orderForm, deliveryMethod: e.target.value as DeliveryMethod})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                    <option value="PICKUP">Pickup</option>
                    <option value="SHIPPING">Shipping</option>
                  </select>
                </div>

                {orderForm.deliveryMethod === 'SHIPPING' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Shipping Address</label>
                    <textarea value={orderForm.shippingAddress} onChange={e => setOrderForm({...orderForm, shippingAddress: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" rows={2} />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea value={orderForm.notes} onChange={e => setOrderForm({...orderForm, notes: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" rows={2} placeholder="Additional specifications or requirements..." />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setShowOrderModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Create Order</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Record Payment</h2>
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer <span className="text-red-500">*</span></label>
                  <select value={paymentForm.customerId} onChange={e => setPaymentForm({...paymentForm, customerId: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required>
                    <option value="">Select customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                    {paymentForm.salesOrderId && (
                      <div className="p-3 bg-slate-50 rounded-lg text-sm">
                        <span className="text-slate-600">For Order: </span>
                        <span className="font-medium">{orders.find(o => o.id === paymentForm.salesOrderId)?.orderNumber || paymentForm.salesOrderId}</span>
                      </div>
                    )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Transaction Type</label>
                  <select value={paymentForm.transactionType} onChange={e => setPaymentForm({...paymentForm, transactionType: e.target.value as TransactionType})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                    <option value="DEPOSIT">Deposit</option>
                    <option value="PAYMENT">Payment</option>
                    <option value="CORE_CREDIT_APPLIED">Apply Core Credit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                  <select value={paymentForm.paymentMethod} onChange={e => setPaymentForm({...paymentForm, paymentMethod: e.target.value as PaymentMethod})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CORE_CREDIT">Core Credit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment For</label>
                  <select value={paymentForm.paymentCategory} onChange={e => setPaymentForm({...paymentForm, paymentCategory: e.target.value as 'ROLL' | 'BAG' | 'BOTH'})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                    <option value="ROLL">Rolls</option>
                    <option value="BAG">Packing Bags</option>
                    <option value="BOTH">Both</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦) <span className="text-red-500">*</span></label>
                  <input type="number" min="1" value={paymentForm.amount || ''} onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
                  <input type="text" value={paymentForm.referenceNumber} onChange={e => setPaymentForm({...paymentForm, referenceNumber: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" placeholder="Optional" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" rows={2} />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg">Record Payment</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Core Buyback Modal */}
        {showCoreBuybackModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Core Buyback</h2>
              <form onSubmit={handleRecordCoreBuyback} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer (for credit)</label>
                  <select value={coreBuybackForm.customerId} onChange={e => setCoreBuybackForm({...coreBuybackForm, customerId: e.target.value, sellerName: ''})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                    <option value="">-- Select customer (optional) --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {!coreBuybackForm.customerId && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Seller Name (for cash) <span className="text-red-500">*</span></label>
                    <input type="text" value={coreBuybackForm.sellerName} onChange={e => setCoreBuybackForm({...coreBuybackForm, sellerName: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required={!coreBuybackForm.customerId} />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Number of Cores <span className="text-red-500">*</span></label>
                  <input type="number" min="1" value={coreBuybackForm.coresQuantity || ''} onChange={e => setCoreBuybackForm({...coreBuybackForm, coresQuantity: parseInt(e.target.value) || 0})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required />
                </div>

                <div className="p-3 bg-purple-50 rounded-lg">
                  <span className="text-sm font-medium text-purple-800">Rate: ₦150/core</span>
                  {coreBuybackValue > 0 && (
                    <span className="block text-lg font-bold text-purple-700 mt-1">Total: ₦{coreBuybackValue.toLocaleString()}</span>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                  <select value={coreBuybackForm.paymentMethod} onChange={e => setCoreBuybackForm({...coreBuybackForm, paymentMethod: e.target.value as PaymentMethod})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea value={coreBuybackForm.notes} onChange={e => setCoreBuybackForm({...coreBuybackForm, notes: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" rows={2} />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setShowCoreBuybackModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg">Record Buyback</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Production Setup Modal */}
        {showProductionModal && productionOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Start Production - {productionOrder.orderNumber}</h2>
              
              <div className="mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Customer:</span>
                    <span className="ml-2 font-medium">{productionOrder.customer?.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Material:</span>
                    <span className="ml-2 font-medium">{productionOrder.specsJson?.materialType || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Quantity:</span>
                    <span className="ml-2 font-medium">{Number(productionOrder.quantityOrdered).toFixed(1)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Unit Price:</span>
                    <span className="ml-2 font-medium">₦{Number(productionOrder.unitPrice).toLocaleString()}/kg</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Machine <span className="text-red-500">*</span></label>
                  <select 
                    value={productionForm.machine} 
                    onChange={e => setProductionForm({...productionForm, machine: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  >
                    <option value="">Select Machine</option>
                    <option value="MC1">MC1</option>
                    <option value="MC2">MC2</option>
                    <option value="MC3">MC3</option>
                    <option value="MC4">MC4</option>
                    <option value="MC5">MC5</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plain Rolls Category</label>
                  <select 
                    value={productionForm.category} 
                    onChange={e => {
                      setProductionForm({...productionForm, category: e.target.value})
                      loadAvailableRolls(e.target.value || undefined)
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="">All Categories</option>
                    <option value="25microns">25 Microns</option>
                    <option value="27microns">27 Microns</option>
                    <option value="28microns">28 Microns</option>
                    <option value="30microns">30 Microns</option>
                    <option value="Premium">Premium</option>
                    <option value="SuPremium">Super Premium</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Select Parent Rolls <span className="text-red-500">*</span></label>
                  {!productionForm.category ? (
                    <p className="text-sm text-slate-400 italic">Select a Plain Rolls Category above to see available rolls</p>
                  ) : loadingRolls ? (
                    <p className="text-sm text-slate-500">Loading available rolls...</p>
                  ) : availableRolls.length === 0 ? (
                    <p className="text-sm text-amber-600">
                      No available rolls for "{productionForm.category}". Try a different category or add more inventory.
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-2 space-y-1">
                      {availableRolls.map(roll => (
                        <label key={roll.id} className="flex items-center p-2 hover:bg-slate-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={productionForm.rollIds.includes(roll.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setProductionForm({...productionForm, rollIds: [...productionForm.rollIds, roll.id]})
                              } else {
                                setProductionForm({...productionForm, rollIds: productionForm.rollIds.filter(id => id !== roll.id)})
                              }
                              calculateWaste()
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm">
                            {roll.rollNumber} - {Number(roll.remainingWeight).toFixed(1)}kg ({roll.material?.subCategory || 'N/A'})
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Printed Roll Weights (space or comma-separated, kg) - max 35 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={productionForm.printedRollWeights}
                    onChange={e => {
                      setProductionForm({...productionForm, printedRollWeights: e.target.value})
                      setCalculatedWaste(null)
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    placeholder="e.g. 14.5, 16, 18.2 or 14.5 16 18.2"
                  />
                  {(() => {
                    const weights = productionForm.printedRollWeights.split(/[\s,]+/)
                      .map(w => parseFloat(w))
                      .filter(w => !isNaN(w) && w > 0)
                    const totalPrintedWeight = weights.reduce((sum, w) => sum + w, 0)
                    const selectedRollsData = availableRolls.filter(r => productionForm.rollIds.includes(r.id))
                    const totalParentWeight = selectedRollsData.reduce((sum, r) => sum + Number(r.remainingWeight || 0), 0)
                    const remaining = totalParentWeight - totalPrintedWeight
                    return (
                      <div className="flex justify-between items-center mt-1">
                        {weights.length > 0 && (
                          <p className="text-sm text-slate-600">
                            {weights.length} rolls, {totalPrintedWeight.toFixed(2)}kg total
                          </p>
                        )}
                        {selectedRollsData.length > 0 && (
                          <p className={`text-sm font-medium ${
                            remaining < 0 ? 'text-red-600' : remaining < 10 ? 'text-yellow-600' : 'text-green-600'
                          }`}>
                            {remaining >= 0 ? `Remaining: ${remaining.toFixed(2)}kg` : `Exceeded by ${Math.abs(remaining).toFixed(2)}kg`}
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Waste Weight (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productionForm.wasteWeight || calculatedWaste || ''}
                    onChange={e => setProductionForm({...productionForm, wasteWeight: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    placeholder="0"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    value={productionForm.notes}
                    onChange={e => setProductionForm({...productionForm, notes: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    rows={2}
                    placeholder="Production notes..."
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setShowProductionModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button onClick={handleStartProduction} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Start Production</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pickup Modal */}
        {showPickupModal && productionOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Record Pickup - {productionOrder.orderNumber}</h2>
              
              <div className="mb-4 p-3 bg-teal-50 rounded-lg border border-teal-200">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Customer:</span>
                    <span className="ml-2 font-medium">{productionOrder.customer?.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Ordered:</span>
                    <span className="ml-2 font-medium">{Number(productionOrder.quantityOrdered).toFixed(1)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Produced:</span>
                    <span className="ml-2 font-medium text-indigo-600">{Number(productionOrder.quantityProduced || 0).toFixed(1)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Already Delivered:</span>
                    <span className="ml-2 font-medium">{Number(productionOrder.quantityDelivered).toFixed(1)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Remaining:</span>
                    <span className="ml-2 font-medium text-teal-600">{((Number(productionOrder.quantityProduced || 0)) - Number(productionOrder.quantityDelivered)).toFixed(1)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Unit Price:</span>
                    <span className="ml-2 font-medium">₦{Number(productionOrder.unitPrice).toLocaleString()}/kg</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Pickup Value:</span>
                    <span className="ml-2 font-medium text-teal-600">₦{((productionOrder.unitPrice || 0) * pickupForm.quantityToPickup).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity to Pick Up (kg) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    value={pickupForm.quantityToPickup || ''}
                    onChange={e => setPickupForm({...pickupForm, quantityToPickup: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    min="0.1"
                    max={Number(productionOrder.quantityProduced || 0) - Number(productionOrder.quantityDelivered)}
                    step="0.1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    value={pickupForm.notes}
                    onChange={e => setPickupForm({...pickupForm, notes: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    rows={2}
                    placeholder="Pickup notes..."
                  />
                </div>

                <div className="border-t border-slate-200 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-3">Packing Bags (Optional)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Quantity (bundles)</label>
                      <input
                        type="number"
                        value={pickupForm.packingBags || ''}
                        onChange={e => setPickupForm({...pickupForm, packingBags: parseInt(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Price per Bundle (₦)</label>
                      <input
                        type="number"
                        value={pickupForm.packingBagPrice || ''}
                        onChange={e => setPickupForm({...pickupForm, packingBagPrice: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {pickupForm.packingBags > 0 && pickupForm.packingBagPrice > 0 && (
                    <p className="text-sm text-teal-600 mt-2 font-medium">
                      Packing Bags Total: ₦{(pickupForm.packingBags * pickupForm.packingBagPrice).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setShowPickupModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button onClick={handleRecordPickup} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">Record Pickup</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order Details Modal */}
        {showOrderDetails && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowOrderDetails(null)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Order Details: {showOrderDetails.orderNumber}</h2>
                <button onClick={() => setShowOrderDetails(null)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Customer</p>
                    <p className="text-sm font-medium">{showOrderDetails.customer?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Status</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[showOrderDetails.status]}`}>
                      {ORDER_STATUS_LABELS[showOrderDetails.status]}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 -mt-2">
                  <div>
                    <p className="text-xs text-slate-500">Ordered</p>
                    <p className="text-lg font-bold text-slate-900">
                      {showOrderDetails.specsJson?.quantityInUnits && showOrderDetails.specsJson.quantityType?.includes('roll')
                        ? `${showOrderDetails.specsJson.quantityInUnits} rolls (${showOrderDetails.specsJson.quantityInUnits! * rollWeight} kg)`
                        : `${Number(showOrderDetails.quantityOrdered).toFixed(1)} kg`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Produced</p>
                    <p className="text-lg font-bold text-indigo-700">
                      {Number(showOrderDetails.quantityProduced || 0).toFixed(1)} kg
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Delivered</p>
                    <p className="text-lg font-bold text-teal-700">
                      {Number(showOrderDetails.quantityDelivered || 0).toFixed(1)} kg
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <p className="text-xs text-slate-500">Unit Price</p>
                    <p className="text-sm font-medium">₦{Number(showOrderDetails.unitPrice).toLocaleString()}/kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Packing Bags</p>
                    <p className="text-sm font-medium">{Number(showOrderDetails.packingBagsQuantity || 0)} pcs</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-slate-500">Total</p>
                      <p className="text-lg font-bold text-slate-900">₦{Number(showOrderDetails.totalAmount).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Paid</p>
                      <p className="text-lg font-bold text-green-600">₦{Number(showOrderDetails.totalPaid).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Balance</p>
                      <p className="text-lg font-bold text-red-600">₦{Math.max(0, showOrderDetails.totalAmount - showOrderDetails.totalPaid).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {showOrderDetails.specsJson && Object.keys(showOrderDetails.specsJson).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 mb-2">Order Details</h3>
                    <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-2 text-sm">
                      {showOrderDetails.specsJson.materialType && <div><span className="text-slate-500">Material:</span> {showOrderDetails.specsJson.materialType}</div>}
                      {showOrderDetails.specsJson.materialCode && <div><span className="text-slate-500">Code:</span> {showOrderDetails.specsJson.materialCode}</div>}
                      {showOrderDetails.specsJson.width && <div><span className="text-slate-500">Width:</span> {showOrderDetails.specsJson.width}mm</div>}
                      {showOrderDetails.specsJson.color && <div><span className="text-slate-500">Color:</span> {showOrderDetails.specsJson.color}</div>}
                      {showOrderDetails.specsJson.material && <div><span className="text-slate-500">Material:</span> {showOrderDetails.specsJson.material}</div>}
                      {showOrderDetails.specsJson.gsm && <div><span className="text-slate-500">GSM:</span> {showOrderDetails.specsJson.gsm}</div>}
                      {showOrderDetails.specsJson.notes && <div className="col-span-2"><span className="text-slate-500">Notes:</span> {showOrderDetails.specsJson.notes}</div>}
                    </div>
                  </div>
                )}

                {showOrderDetails.payments && showOrderDetails.payments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 mb-2">Payment History</h3>
                    <div className="space-y-2">
                      {showOrderDetails.payments.map(p => (
                        <div key={p.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg text-sm">
                          <div>
                            <span className="font-medium">{p.transactionType.replace('_', ' ')}</span>
                            <span className="text-slate-500 ml-2">{new Date(p.receivedAt).toLocaleDateString()}</span>
                          </div>
                          <span className="text-green-600 font-medium">₦{Number(p.amount).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showOrderDetails.quantityProduced && showOrderDetails.quantityProduced > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 mb-2">Printed Rolls (Production)</h3>
                    <div className="p-3 bg-indigo-50 rounded-lg">
                      <p className="text-sm"><span className="text-slate-500">Total Produced:</span> <span className="font-medium">{Number(showOrderDetails.quantityProduced).toFixed(1)} kg</span></p>
                      {showOrderDetails.productionJobId && <p className="text-xs text-slate-500 mt-1">Job ID: {showOrderDetails.productionJobId.slice(-8)}</p>}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500">Created: {new Date(showOrderDetails.createdAt).toLocaleDateString()}</p>
                  <div className="flex space-x-2">
                    {showOrderDetails.paymentStatus !== 'FULLY_PAID' && showOrderDetails.paymentStatus !== 'OVERPAID' && (
                      <button onClick={() => openPaymentModal(showOrderDetails)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        Record Payment
                      </button>
                    )}
                    {getAvailableActions(showOrderDetails).map(a => (
                      <button
                        key={a.action}
                        onClick={() => a.action === 'invoice' ? handleCreateInvoice(showOrderDetails.id) : handleOrderAction(showOrderDetails.id, a.action as any)}
                        className={`px-4 py-2 text-white rounded-lg ${a.variant}`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Customer Balance Modal */}
        {showCustomerBalance && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCustomerBalance(null)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-4">{showCustomerBalance.customerName}</h2>
              <div className="space-y-4">
                <div className="p-4 bg-red-50 rounded-xl">
                  <p className="text-xs text-red-600">Total Outstanding</p>
                  <p className="text-2xl font-bold text-red-700">₦{Number(showCustomerBalance.totalOutstanding).toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <p className="text-xs text-blue-600">Deposit Held</p>
                    <p className="text-lg font-bold text-blue-700">₦{Number(showCustomerBalance.depositHeld).toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-xl">
                    <p className="text-xs text-purple-600">Core Credit</p>
                    <p className="text-lg font-bold text-purple-700">₦{Number(showCustomerBalance.coreCreditBalance).toLocaleString()}</p>
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded-xl">
                  <p className="text-xs text-green-600">Available Credit</p>
                  <p className="text-lg font-bold text-green-700">₦{Number(showCustomerBalance.availableCredit).toLocaleString()}</p>
                </div>
                <div className="text-center text-sm text-slate-500">
                  Active Orders: {showCustomerBalance.ordersCount}
                </div>
              </div>
              <div className="mt-6">
                <button onClick={() => setShowCustomerBalance(null)} className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Invoice Modal */}
        {showInvoiceModal && currentInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowInvoiceModal(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Invoice</h2>
                <button onClick={() => setShowInvoiceModal(false)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-xs text-slate-500">Invoice #</p>
                    <p className="font-medium">{currentInvoice.invoiceNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Date</p>
                    <p className="font-medium">{new Date(currentInvoice.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500">Customer</p>
                  <p className="font-medium">{currentInvoice.customer?.name || currentInvoice.salesOrder?.customer?.name || 'N/A'}</p>
                </div>

                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Qty</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Unit</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="px-4 py-2">Printed Rolls</td>
                        <td className="px-4 py-2 text-right">{Number(currentInvoice.quantityDelivered || 0).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right">kg</td>
                        <td className="px-4 py-2 text-right">₦{(Number(currentInvoice.subtotal) || 0).toLocaleString()}</td>
                      </tr>
                      {currentInvoice.packingBagsQuantity && currentInvoice.packingBagsQuantity > 0 && (
                        <tr>
                          <td className="px-4 py-2">Packing Bags</td>
                          <td className="px-4 py-2 text-right">{currentInvoice.packingBagsQuantity}</td>
                          <td className="px-4 py-2 text-right">pcs</td>
                          <td className="px-4 py-2 text-right">₦{(Number(currentInvoice.packingBagsSubtotal) || 0).toLocaleString()}</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right font-medium">Subtotal:</td>
                        <td className="px-4 py-2 text-right">₦{(Number(currentInvoice.subtotal) + Number(currentInvoice.packingBagsSubtotal || 0)).toLocaleString()}</td>
                      </tr>
                      {Number(currentInvoice.vatAmount) > 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-right text-xs">VAT (7.5%):</td>
                          <td className="px-4 py-2 text-right text-xs">₦{(Number(currentInvoice.vatAmount) || 0).toLocaleString()}</td>
                        </tr>
                      )}
                      <tr className="font-bold">
                        <td colSpan={3} className="px-4 py-2 text-right">Total:</td>
                        <td className="px-4 py-2 text-right">₦{(Number(currentInvoice.totalAmount) || 0).toLocaleString()}</td>
                      </tr>
                      {Number(currentInvoice.balanceDue) > 0 && (
                        <tr className="text-red-600">
                          <td colSpan={3} className="px-4 py-2 text-right">Balance Due:</td>
                          <td className="px-4 py-2 text-right">₦{(Number(currentInvoice.balanceDue) || 0).toLocaleString()}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button onClick={() => setShowInvoiceModal(false)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
