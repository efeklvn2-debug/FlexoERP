import { useState, useEffect } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import { useNavigate } from 'react-router-dom'
import { salesOrderApi, SalesOrder, PaymentTransaction, Invoice, CustomerBalance, Receipt, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, InvoiceStatus, DeliveryMethod, Customer } from '../api/salesOrders'
import { pricingApi } from '../api/pricing'
import { settingsApi } from '../api/settings'
import { productionApi, ParentRoll, ProductionJob } from '../api/production'
import { Layout } from '../components/Layout'
import { DateInput } from '../components/DateInput'


type PaymentMethod = 'Cash' | 'Electronic' | 'CORE_CREDIT'
type QuantityType = 'rolls' | 'kg'

type Tab = 'orders' | 'payments' | 'invoices' | 'core-buyback' | 'balances' | 'packing-bags'

const PROD_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  IN_PRODUCTION: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
}

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PARTIAL: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled'
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  MRP_PENDING: 'bg-orange-100 text-orange-800',
  IN_PRODUCTION: 'bg-indigo-100 text-indigo-800',
  READY: 'bg-purple-100 text-purple-800',
  PICKED_UP: 'bg-teal-100 text-teal-800',

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
  packSize?: number
  subCategory?: string
}

export function SalesOrdersPage() {
  const navigate = useNavigate()
  const notify = useNotification()
  const [activeTab, setActiveTab] = useState<Tab>('orders')
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [payments, setPayments] = useState<PaymentTransaction[]>([])
  const [paymentDateFrom, setPaymentDateFrom] = useState('')
  const [paymentDateTo, setPaymentDateTo] = useState('')
  const [paymentPeriod, setPaymentPeriod] = useState('')
  const [receiptDropdown, setReceiptDropdown] = useState<string | null>(null)
  const [generatingReceipt, setGeneratingReceipt] = useState<string | null>(null)
  const [invoiceDropdown, setInvoiceDropdown] = useState<string | null>(null)
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null)
  const [coreBuybackDateFrom, setCoreBuybackDateFrom] = useState('')
  const [coreBuybackDateTo, setCoreBuybackDateTo] = useState('')
  const [coreBuybackPeriod, setCoreBuybackPeriod] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('')
  const [invoiceCustomerSearch, setInvoiceCustomerSearch] = useState('')
  const [coreBuybacks, setCoreBuybacks] = useState<any[]>([])
  const [customerBalances, setCustomerBalances] = useState<CustomerBalance[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<MaterialType[]>([])
  const [allMaterials, setAllMaterials] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)

  const [rollWeight, setRollWeight] = useState(15)

  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showCoreBuybackModal, setShowCoreBuybackModal] = useState(false)
  const [showOrderDetails, setShowOrderDetails] = useState<SalesOrder | null>(null)
  const [showCustomerBalance, setShowCustomerBalance] = useState<CustomerBalance | null>(null)
  const [showProductionModal, setShowProductionModal] = useState(false)
  const [showPickupModal, setShowPickupModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showProductionJobModal, setShowProductionJobModal] = useState(false)
  const [viewingProductionJob, setViewingProductionJob] = useState<ProductionJob | null>(null)
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null)
  const [businessTin, setBusinessTin] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [productionOrder, setProductionOrder] = useState<SalesOrder | null>(null)
  const [availableRolls, setAvailableRolls] = useState<ParentRoll[]>([])
  const [loadingRolls, setLoadingRolls] = useState(false)

  const [statusFilter, setStatusFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')

  const [orderSortDir, setOrderSortDir] = useState<'asc' | 'desc'>('desc')
  const [paymentSortDir, setPaymentSortDir] = useState<'asc' | 'desc'>('desc')
  const [invoiceSortDir, setInvoiceSortDir] = useState<'asc' | 'desc'>('desc')
  const [coreBuybackSortDir, setCoreBuybackSortDir] = useState<'asc' | 'desc'>('desc')

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

  const [paymentModalMode, setPaymentModalMode] = useState<'payment' | 'deposit'>('payment')
  const [paymentForm, setPaymentForm] = useState({
    salesOrderId: '',
    customerId: '',
    paymentMethod: 'Cash' as PaymentMethod,
    amount: 0,
    referenceNumber: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  })

  const [coreBuybackForm, setCoreBuybackForm] = useState(() => {
    const stored = localStorage.getItem('appSettings')
    let defaultRate = 150
    if (stored) { try { const s = JSON.parse(stored); if (s.coreDepositValue) defaultRate = Number(s.coreDepositValue) } catch {} }
    return { customerId: '', sellerName: '', coresQuantity: 0, ratePerCore: defaultRate, paymentMethod: 'Cash' as PaymentMethod, notes: '' }
  })

  const [productionForm, setProductionForm] = useState({
    machine: '',
    category: '',
    rollIds: [] as string[],
    printedRollWeights: '',
    rollWaste: {} as Record<string, number>,
    rollConsumption: {} as Record<string, number>,
    notes: ''
  })

  const [pickupForm, setPickupForm] = useState({
    packingBags: 0,
    packingBagPrice: 0,
    notes: '',
    date: new Date().toISOString().split('T')[0]
  })

  const [pickupRolls, setPickupRolls] = useState<{ id: string; weightUsed: number; status: string; rollId: string }[]>([])
  const [selectedRollIds, setSelectedRollIds] = useState<string[]>([])

  const [packingBagForm, setPackingBagForm] = useState({
    customerId: '',
    quantity: 0,
    unitPrice: 0,
    paymentMethod: 'Cash' as 'Cash' | 'Electronic',
    referenceNumber: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  })

  const [packingBagDeposit, setPackingBagDeposit] = useState(0)
  const [showDepositConfirm, setShowDepositConfirm] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      console.log('Loading data...')
      const [ordersRes, customersRes, materialsRes] = await Promise.all([
        salesOrderApi.getOrders(),
        salesOrderApi.getCustomers(),
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
      
      const allMat: MaterialType[] = Array.isArray(materialsRes.data) ? materialsRes.data : (materialsRes.data as any)?.data || []
      console.log('All materials:', allMat.map(m => ({ name: m.name, category: m.category })))
      setAllMaterials(allMat)
      const filteredMaterials = allMat.filter((m: MaterialType) => 
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

      loadCustomerBalances()
    } catch (err: any) {
      console.error('Load data error:', err)
      notify.error(err.message || 'Failed to load orders')
    }
    setLoading(false)
  }

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.receipt-dropdown-area') && !target.closest('.invoice-dropdown-area')) {
        setReceiptDropdown(null)
        setInvoiceDropdown(null)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const handleFocus = () => loadData()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  useEffect(() => {
    if (packingBagForm.customerId) {
      salesOrderApi.getCustomerBalance(packingBagForm.customerId).then(res => {
        if ((res.data as any)?.data) setPackingBagDeposit((res.data as any).data.depositHeld || 0)
      }).catch(() => setPackingBagDeposit(0))
    } else {
      setPackingBagDeposit(0)
    }
  }, [packingBagForm.customerId])

  useEffect(() => {
    const pbag = allMaterials.find(m => m.code === 'PBAG')
    if (pbag && pbag.pricePerPack && pbag.packSize) {
      const bundlePrice = pbag.pricePerPack * pbag.packSize
      setPackingBagForm(prev => ({ ...prev, unitPrice: bundlePrice }))
    }
  }, [allMaterials])

  const loadPayments = async (dateFrom?: string, dateTo?: string) => {
    try {
      const res = await salesOrderApi.getPayments({ dateFrom, dateTo })
      const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      setPayments(data)
    } catch (err: any) {
      console.error('Failed to load payments:', err)
    }
  }

  const handlePrintReceipt = async (paymentId: string) => {
    setGeneratingReceipt(paymentId)
    setReceiptDropdown(null)
    try {
      const res = await salesOrderApi.generateReceipt(paymentId)
      const receipt = (res as any).data?.data as Receipt | undefined
      if (!receipt) return

      let settingsStr = localStorage.getItem('appSettings')
      let settings: any = null
      try { settings = settingsStr ? JSON.parse(settingsStr) : null } catch {}
      if (!settings) {
        try {
          const settingsRes = await settingsApi.getSettings()
          const s = (settingsRes.data as any)?.data ?? settingsRes.data
          if (s) {
            const flat = {
              invoiceCompanyName: s.invoiceCompanyName || '',
              invoiceLogoUrl: s.invoiceLogoUrl || '',
              invoicePrimaryColor: s.invoicePrimaryColor || '#1e3a5f',
              invoiceAccentColor: s.invoiceAccentColor || '#dc2626',
              invoiceFooter: s.invoiceFooter || 'Thank you for your business!',
              receiptCompanyName: s.receiptCompanyName || s.invoiceCompanyName || '',
              receiptLogoUrl: s.receiptLogoUrl || '',
              receiptFooter: s.receiptFooter || s.invoiceFooter || 'Thank you for your business!',
              businessAddress: s.businessAddress || '',
              businessTin: s.businessTin || '',
              coreDepositValue: Number(s.coreDepositValue || 150)
            }
            localStorage.setItem('appSettings', JSON.stringify(flat))
            settings = flat
          }
        } catch {}
      }

      const companyName = settings?.receiptCompanyName || settings?.invoiceCompanyName || 'FLEXOPRINT NIGERIA LTD'
      const businessAddress = settings?.businessAddress || ''
      const businessTin = settings?.businessTin || ''
      const footerText = settings?.receiptFooter || settings?.invoiceFooter || 'Thank you for your business!'
      const logoUrl = settings?.receiptLogoUrl || settings?.invoiceLogoUrl || ''

      const dateStr = new Date(receipt.generatedAt).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      })
      const timeStr = new Date(receipt.generatedAt).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit'
      })
      const payMethod = receipt.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : 'Cash'
      const orderNumber = receipt.paymentTransaction?.salesOrder?.orderNumber || '—'
      const amount = Number(receipt.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })
      const txType = (receipt.paymentTransaction?.transactionType || '').replace(/_/g, ' ')

      const win = window.open('', '_blank', 'width=400,height=600')
      if (!win) return

      win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt - ${receipt.receiptNumber}</title>
<style>
  @page { width: 80mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 80mm; font-family: 'Courier New', Courier, monospace; font-size: 12px;
    color: #000; padding: 8px 6px; line-height: 1.4;
  }
  .center { text-align: center; } .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .logo { max-width: 50px; display: block; margin: 0 auto 4px; }
  .company-name { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 2px; }
  .info { font-size: 10px; text-align: center; color: #333; }
  .receipt-title { font-size: 18px; font-weight: bold; text-align: center; margin: 2px 0; }
  .receipt-no { font-size: 13px; text-align: center; margin-bottom: 1px; }
  .datetime { font-size: 10px; text-align: center; margin-bottom: 4px; }
  .row { display: flex; justify-content: space-between; font-size: 12px; margin: 1px 0; }
  .label { color: #333; } .value { font-weight: bold; }
  .amount { font-size: 14px; font-weight: bold; text-align: center; margin: 4px 0; }
  .footer { text-align: center; font-size: 10px; margin-top: 8px; color: #555; }
  .small { font-size: 9px; color: #666; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  ${logoUrl ? `<img src="${logoUrl}" class="logo" alt="Logo">` : ''}
  <div class="company-name">${companyName}</div>
  ${businessAddress ? `<div class="info">${businessAddress}</div>` : ''}
  ${businessTin ? `<div class="info">TIN: ${businessTin}</div>` : ''}
  <div class="line"></div>
  <div class="receipt-title">RECEIPT</div>
  <div class="receipt-no">${receipt.receiptNumber}</div>
  <div class="datetime">${dateStr}  ${timeStr}</div>
  <div class="line"></div>
  <div class="row"><span class="label">Customer:</span><span class="value">${receipt.customerName}</span></div>
  <div class="row"><span class="label">Order:</span><span class="value">${orderNumber}</span></div>
  <div class="line"></div>
  <div class="row"><span class="label">Payment:</span><span class="value">${txType}</span></div>
  <div class="row"><span class="label">Method:</span><span class="value">${payMethod}</span></div>
  <div class="amount">₦${amount}</div>
  ${receipt.referenceNumber ? `<div class="row"><span class="label">Ref:</span><span class="value">${receipt.referenceNumber}</span></div>` : ''}
  <div class="line"></div>
  <div class="footer">${footerText}</div>
</body>
</html>`)
      win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 500)
    } catch (err: any) {
      console.error('Failed to generate receipt:', err)
    } finally {
      setGeneratingReceipt(null)
    }
  }

  const handleDownloadReceipt = async (paymentId: string) => {
    setGeneratingReceipt(paymentId)
    setReceiptDropdown(null)
    try {
      const res = await salesOrderApi.generateReceipt(paymentId)
      const receipt = (res as any).data?.data as Receipt | undefined
      if (!receipt) return
      await salesOrderApi.downloadReceiptPdf(receipt.id)
    } catch (err: any) {
      console.error('Failed to download receipt:', err)
    } finally {
      setGeneratingReceipt(null)
    }
  }

  const handlePrintInvoice = async (invoice: Invoice) => {
    setGeneratingInvoice(invoice.id)
    setInvoiceDropdown(null)
    try {
      let settingsStr = localStorage.getItem('appSettings')
      let settings: any = null
      try { settings = settingsStr ? JSON.parse(settingsStr) : null } catch {}
      if (!settings) {
        try {
          const settingsRes = await settingsApi.getSettings()
          const s = (settingsRes.data as any)?.data ?? settingsRes.data
          if (s) {
            const flat = {
              invoiceCompanyName: s.invoiceCompanyName || '',
              invoiceLogoUrl: s.invoiceLogoUrl || '',
              invoicePrimaryColor: s.invoicePrimaryColor || '#1e3a5f',
              invoiceAccentColor: s.invoiceAccentColor || '#dc2626',
              invoiceFooter: s.invoiceFooter || 'Thank you for your business!',
              businessAddress: s.businessAddress || '',
              businessTin: s.businessTin || '',
              receiptCompanyName: s.receiptCompanyName || s.invoiceCompanyName || '',
              receiptLogoUrl: s.receiptLogoUrl || '',
              receiptFooter: s.receiptFooter || s.invoiceFooter || 'Thank you for your business!',
              coreDepositValue: Number(s.coreDepositValue || 150)
            }
            localStorage.setItem('appSettings', JSON.stringify(flat))
            settings = flat
          }
        } catch {}
      }

      const companyName = settings?.invoiceCompanyName || 'FLEXOPRINT NIGERIA LTD'
      const businessAddress = settings?.businessAddress || ''
      const businessTin = settings?.businessTin || ''
      const footerText = settings?.invoiceFooter || 'Thank you for your business!'
      const logoUrl = settings?.invoiceLogoUrl || ''

      const customerName = invoice.customer?.name || invoice.salesOrder?.customer?.name || 'N/A'
      const orderNumber = invoice.salesOrder?.orderNumber || invoice.salesOrderId || '—'
      const dateStr = new Date(invoice.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      const dueDateStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
      const qtyDelivered = Number(invoice.quantityDelivered || 0).toFixed(1)
      const rollSubtotal = Number(invoice.subtotal || 0)
      const bagQty = Number(invoice.packingBagsQuantity || 0)
      const bagSubtotal = Number(invoice.packingBagsSubtotal || 0)
      const vatAmount = Number(invoice.vatAmount || 0)
      const totalAmount = Number(invoice.totalAmount || 0)
      const depositApplied = Number(invoice.depositApplied || 0)
      const previousPayments = Number(invoice.previousPayments || 0)
      const balanceDue = Number(invoice.balanceDue || 0)

      const formatNaira = (n: number) => '₦' + n.toLocaleString('en-US', { minimumFractionDigits: 2 })

      const win = window.open('', '_blank', 'width=400,height=700')
      if (!win) return

      win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice - ${invoice.invoiceNumber}</title>
<style>
  @page { width: 80mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 80mm; font-family: 'Courier New', Courier, monospace; font-size: 12px;
    color: #000; padding: 8px 6px; line-height: 1.4;
  }
  .center { text-align: center; } .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .logo { max-width: 50px; display: block; margin: 0 auto 4px; }
  .company-name { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 2px; }
  .info { font-size: 10px; text-align: center; color: #333; }
  .title { font-size: 18px; font-weight: bold; text-align: center; margin: 2px 0; }
  .doc-no { font-size: 13px; text-align: center; margin-bottom: 1px; }
  .row { display: flex; justify-content: space-between; font-size: 12px; margin: 1px 0; }
  .label { color: #333; } .value { font-weight: bold; }
  .item-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
  .item-desc { flex: 1; } .item-qty { text-align: right; width: 60px; } .item-amount { text-align: right; width: 90px; }
  .totals-row { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
  .totals-label { text-align: left; } .totals-value { font-weight: bold; text-align: right; }
  .balance-due { font-size: 14px; font-weight: bold; text-align: center; color: #dc2626; margin: 4px 0; }
  .amount-paid { font-size: 14px; font-weight: bold; text-align: center; color: #16a34a; margin: 4px 0; }
  .deposit-note { font-size: 11px; font-weight: bold; text-align: center; color: #1d4ed8; margin: 4px 0; }
  .footer { text-align: center; font-size: 10px; margin-top: 8px; color: #555; }
  .small { font-size: 9px; color: #666; }
  .item-header { font-size: 10px; font-weight: bold; color: #555; margin-bottom: 2px; }
  .stamp-wrapper { position: relative; }
  .stamp-overlay {
    position: absolute; inset: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
  }
  .stamp-text {
    font-size: 48px; font-weight: 900; color: rgba(22,163,74,0.12);
    border: 5px solid rgba(22,163,74,0.18);
    border-radius: 12px; padding: 8px 20px;
    transform: rotate(-30deg);
    text-transform: uppercase; letter-spacing: 0.2em;
    font-family: 'Courier New', Courier, monospace;
  }
  .stamp-badge {
    position: absolute; top: 4px; right: 4px; z-index: 11;
    background: #16a34a; color: #fff;
    font-size: 10px; font-weight: bold;
    padding: 3px 10px; border-radius: 20px;
    display: flex; align-items: center; gap: 4px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    font-family: Arial, Helvetica, sans-serif;
  }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="stamp-wrapper">
    ${invoice.status === 'PAID' ? `
    <div class="stamp-overlay">
      <div class="stamp-text">PAID</div>
      <div class="stamp-badge">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <path d="M5 13l4 4L19 7"/>
        </svg>
        PAID ${invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : ''}
      </div>
    </div>
    ` : ''}
    ${logoUrl ? `<img src="${logoUrl}" class="logo" alt="Logo">` : ''}
    <div class="company-name">${companyName}</div>
    ${businessAddress ? `<div class="info">${businessAddress}</div>` : ''}
    ${businessTin ? `<div class="info">TIN: ${businessTin}</div>` : ''}
    <div class="line"></div>
    <div class="title">INVOICE</div>
    <div class="doc-no">${invoice.invoiceNumber}</div>
    <div class="info">${dateStr}${dueDateStr ? '  |  Due: ' + dueDateStr : ''}</div>
    <div class="info">Status: ${invoice.status.replace(/_/g, ' ')}</div>
    <div class="line"></div>
    <div class="row"><span class="label">Customer:</span><span class="value">${customerName}</span></div>
    <div class="row"><span class="label">Order:</span><span class="value">${orderNumber}</span></div>
    <div class="line"></div>
    <div class="item-header">Items</div>
    <div class="item-row"><span class="item-desc">Printed Rolls</span><span class="item-qty">${qtyDelivered} kg</span><span class="item-amount">${formatNaira(rollSubtotal)}</span></div>
    ${bagQty > 0 ? `<div class="item-row"><span class="item-desc">Packing Bags</span><span class="item-qty">${bagQty} pcs</span><span class="item-amount">${formatNaira(bagSubtotal)}</span></div>` : ''}
    <div class="line"></div>
    <div class="totals-row"><span class="totals-label">Subtotal (excl. VAT)</span><span class="totals-value">${formatNaira(rollSubtotal + bagSubtotal)}</span></div>
    ${vatAmount > 0 ? `<div class="totals-row"><span class="totals-label">VAT</span><span class="totals-value">${formatNaira(vatAmount)}</span></div>` : ''}
    <div class="totals-row"><span class="totals-label" style="font-weight:bold">Total (incl. VAT)</span><span class="totals-value" style="font-weight:bold">${formatNaira(totalAmount)}</span></div>
    ${depositApplied > 0 ? `<div class="totals-row"><span class="totals-label" style="color:#dc2626">Deposit Applied</span><span class="totals-value" style="color:#dc2626">-${formatNaira(depositApplied)}</span></div>` : ''}
    ${previousPayments > 0 ? `<div class="totals-row"><span class="totals-label" style="color:#dc2626">Previous Payments</span><span class="totals-value" style="color:#dc2626">-${formatNaira(previousPayments)}</span></div>` : ''}
    ${balanceDue > 0
      ? `<div class="balance-due">${formatNaira(balanceDue)}</div><div class="info" style="font-size:10px">Balance Due</div>`
      : `<div class="amount-paid">${formatNaira(totalAmount - balanceDue)}</div><div class="info" style="font-size:10px">Amount Paid</div>`
    }
    <div class="line"></div>
    <div class="footer">${footerText}</div>
  </div>
</body>
</html>`)
      win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 500)
    } catch (err: any) {
      console.error('Failed to print invoice:', err)
      notify.error(err.message || 'Failed to print invoice')
    } finally {
      setGeneratingInvoice(null)
    }
  }

  const handleDownloadInvoice = async (invoice: Invoice) => {
    setGeneratingInvoice(invoice.id)
    setInvoiceDropdown(null)
    try {
      await salesOrderApi.downloadInvoicePdf(invoice.id)
    } catch (err: any) {
      console.error('Failed to download invoice:', err)
      notify.error(err.message || 'Failed to download invoice')
    } finally {
      setGeneratingInvoice(null)
    }
  }

  const loadInvoices = async () => {
    try {
      const res = await salesOrderApi.getInvoices()
      const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      setInvoices(data)
    } catch (err: any) {
      console.error('Failed to load invoices:', err)
    }
  }

  const loadCoreBuybacks = async (dateFrom?: string, dateTo?: string) => {
    try {
      const res = await salesOrderApi.getCoreBuybacks({ dateFrom, dateTo })
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
      const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      setCustomerBalances(data)
    } catch (err: any) {
      console.error('Failed to load customer balances:', err)
    }
  }

  const getDateRange = (period: string): { from: string; to: string } => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()
    const fmt = (dt: Date) => {
      const yy = dt.getFullYear()
      const mm = String(dt.getMonth() + 1).padStart(2, '0')
      const dd = String(dt.getDate()).padStart(2, '0')
      return `${yy}-${mm}-${dd}`
    }

    switch (period) {
      case 'today': return { from: fmt(now), to: fmt(now) }
      case 'yesterday': {
        const yest = new Date(now); yest.setDate(d - 1)
        return { from: fmt(yest), to: fmt(yest) }
      }
      case 'this-week': {
        const start = new Date(now); start.setDate(d - start.getDay())
        return { from: fmt(start), to: fmt(now) }
      }
      case 'last-week': {
        const end = new Date(now); end.setDate(d - end.getDay() - 1)
        const start = new Date(end); start.setDate(end.getDate() - 6)
        return { from: fmt(start), to: fmt(end) }
      }
      case 'this-month': return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: fmt(now) }
      case 'last-month': {
        const first = new Date(y, m - 1, 1)
        const last = new Date(y, m, 0)
        return { from: fmt(first), to: fmt(last) }
      }
      case 'last-3-months': {
        const start = new Date(y, m - 2, 1)
        return { from: fmt(start), to: fmt(now) }
      }
      default: return { from: '', to: '' }
    }
  }

  const applyPaymentPeriod = (period: string) => {
    setPaymentPeriod(period)
    const range = getDateRange(period)
    setPaymentDateFrom(range.from)
    setPaymentDateTo(range.to)
    loadPayments(range.from || undefined, range.to || undefined)
  }

  const clearPaymentFilters = () => {
    setPaymentPeriod('')
    setPaymentDateFrom('')
    setPaymentDateTo('')
    loadPayments()
  }

  const applyCoreBuybackPeriod = (period: string) => {
    setCoreBuybackPeriod(period)
    const range = getDateRange(period)
    setCoreBuybackDateFrom(range.from)
    setCoreBuybackDateTo(range.to)
    loadCoreBuybacks(range.from || undefined, range.to || undefined)
  }

  const clearCoreBuybackFilters = () => {
    setCoreBuybackPeriod('')
    setCoreBuybackDateFrom('')
    setCoreBuybackDateTo('')
    loadCoreBuybacks()
  }

  useEffect(() => {
    if (activeTab === 'payments') loadPayments(paymentDateFrom || undefined, paymentDateTo || undefined)
    if (activeTab === 'invoices') loadInvoices()
    if (activeTab === 'core-buyback') loadCoreBuybacks(coreBuybackDateFrom || undefined, coreBuybackDateTo || undefined)
    if (activeTab === 'balances') loadCustomerBalances()
  }, [activeTab])

  const filteredOrders = orders.filter(o => {
    if (statusFilter && o.status !== statusFilter) return false
    if (customerFilter && o.customerId !== customerFilter) return false
    if (paymentFilter && o.paymentStatus !== paymentFilter) return false
    return true
  })

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return orderSortDir === 'desc' ? -d : d
  })

  const sortedPayments = [...payments].sort((a, b) => {
    const d = new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
    return paymentSortDir === 'desc' ? -d : d
  })

  const sortedInvoices = [...invoices].sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return invoiceSortDir === 'desc' ? -d : d
  })

  const sortedCoreBuybacks = [...coreBuybacks].sort((a, b) => {
    const d = new Date(a.date).getTime() - new Date(b.date).getTime()
    return coreBuybackSortDir === 'desc' ? -d : d
  })

  const filteredInvoices = sortedInvoices.filter(inv => {
    const statusMatch = !invoiceStatusFilter || inv.status === invoiceStatusFilter
    const nameMatch = !invoiceCustomerSearch || (inv.customer?.name || '').toLowerCase().includes(invoiceCustomerSearch.toLowerCase())
    return statusMatch && nameMatch
  })

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderForm.customerId) { notify.error('Customer is required'); return }
    if (!orderForm.materialTypeId) { notify.error('Material type is required'); return }
    if (!orderForm.quantity || orderForm.quantity <= 0) { notify.error('Quantity is required'); return }
    if (!orderForm.unitPrice || orderForm.unitPrice <= 0) { notify.error('Unit price is required'); return }

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
        shippingAddress: orderForm.shippingAddress || undefined,
        expectedDeliveryDate: orderForm.expectedDeliveryDate || undefined
      })
      console.log('Order response:', res)
      if (res.error) { 
        notify.error(res.error.message); 
        return 
      }
      notify.success('Order created successfully')
      setShowOrderModal(false)
      setOrderForm({ customerId: '', materialTypeId: '', quantityType: 'rolls', quantity: 0, unitPrice: 0, deliveryMethod: 'PICKUP', shippingAddress: '', expectedDeliveryDate: '', notes: '' })
      loadData()
    } catch (err: any) {
      console.error('Create order error:', err)
      notify.error(err.message || 'Failed to create order')
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
    if (!paymentForm.amount || paymentForm.amount <= 0) { notify.error('Amount is required'); return }
    if (!paymentForm.customerId) { notify.error('Customer is required'); return }

    const isPayment = paymentModalMode === 'payment' && paymentForm.salesOrderId

    try {
      const res = await salesOrderApi.recordPayment({
        salesOrderId: paymentForm.salesOrderId || undefined,
        customerId: paymentForm.customerId,
        transactionType: isPayment ? 'PAYMENT' : 'DEPOSIT',
        paymentMethod: paymentForm.paymentMethod,
        amount: paymentForm.amount,
        referenceNumber: paymentForm.referenceNumber || undefined,
        notes: paymentForm.notes || undefined,
        date: paymentForm.date || undefined
      })
      if (res.error) { notify.error(res.error.message); return }
      const overpayment = (res.data as any)?.overpayment || 0
      const msg = isPayment
        ? `Payment of ₦${paymentForm.amount.toLocaleString()} recorded` + (overpayment > 0 ? `. ₦${overpayment.toLocaleString()} overpaid — applied as advance deposit.` : '')
        : `Deposit of ₦${paymentForm.amount.toLocaleString()} recorded`
      notify.success(msg)
      setShowPaymentModal(false)
      setShowInvoiceModal(false)
      setPaymentForm({ salesOrderId: '', customerId: '', paymentMethod: 'Cash', amount: 0, referenceNumber: '', notes: '', date: new Date().toISOString().split('T')[0] })
      loadData()
      loadPayments()
      loadInvoices()
    } catch (err: any) {
      notify.error(err.message || 'Failed to record payment')
    }
  }

  const handlePackingBagSale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!packingBagForm.customerId) { notify.error('Customer is required'); return }
    if (packingBagForm.quantity <= 0) { notify.error('Quantity must be greater than 0'); return }
    if (packingBagForm.unitPrice <= 0) { notify.error('Unit price must be greater than 0'); return }

    if (packingBagDeposit > 0) {
      setShowDepositConfirm(true)
      return
    }

    await submitPackingBagSale(false)
  }

  const submitPackingBagSale = async (applyDeposit: boolean) => {
    try {
      const res = await salesOrderApi.sellPackingBags({
        customerId: packingBagForm.customerId,
        quantity: packingBagForm.quantity,
        unitPrice: packingBagForm.unitPrice,
        paymentMethod: packingBagForm.paymentMethod,
        referenceNumber: packingBagForm.referenceNumber || undefined,
        notes: packingBagForm.notes || undefined,
        applyDeposit,
        date: packingBagForm.date || undefined
      })
      
      if (res.error) { 
        notify.error(res.error.message); 
        return 
      }
      
      const data = res.data as any
      let msg = `Packing bag sale recorded: ${packingBagForm.quantity} bags, ₦${(packingBagForm.quantity * packingBagForm.unitPrice).toLocaleString()}`
      if (data.depositApplied > 0) {
        msg += ` (₦${data.depositApplied.toLocaleString()} deposit applied)`
      }
      notify.success(msg)
      
      setPackingBagForm({
        customerId: '',
        quantity: 0,
        unitPrice: 0,
        paymentMethod: 'Cash',
        referenceNumber: '',
        notes: '',
        date: new Date().toISOString().split('T')[0]
      })
      
      loadData()
    } catch (err: any) {
      notify.error(err.message || 'Failed to record packing bag sale')
    }
  }

  const handleRecordCoreBuyback = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!coreBuybackForm.coresQuantity || coreBuybackForm.coresQuantity <= 0) { notify.error('Core quantity is required'); return }
    if (!coreBuybackForm.customerId && !coreBuybackForm.sellerName) { notify.error('Customer or seller name is required'); return }

    console.log('Recording core buyback:', coreBuybackForm)

    try {
      const res = await salesOrderApi.recordCoreBuyback({
        customerId: coreBuybackForm.customerId || undefined,
        sellerName: coreBuybackForm.sellerName || undefined,
        coresQuantity: coreBuybackForm.coresQuantity,
        ratePerCore: coreBuybackForm.ratePerCore,
        paymentMethod: coreBuybackForm.paymentMethod,
        notes: coreBuybackForm.notes || undefined
      })
      console.log('Core buyback response:', res)
      if (res.error) { notify.error(res.error.message); return }
      notify.success('Core buyback recorded')
      setShowCoreBuybackModal(false)
      const stored = localStorage.getItem('appSettings')
      let defaultRate = 150
      if (stored) { try { const s = JSON.parse(stored); if (s.coreDepositValue) defaultRate = Number(s.coreDepositValue) } catch {} }
      setCoreBuybackForm({ customerId: '', sellerName: '', coresQuantity: 0, ratePerCore: defaultRate, paymentMethod: 'Cash', notes: '' })
      loadCoreBuybacks()
      loadData()
    } catch (err: any) {
      console.error('Core buyback error:', err)
      notify.error(err.message || 'Failed to record core buyback')
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
      if (res?.error) { notify.error(res.error.message); return }
      notify.success(`${action === 'approve' ? 'Order approved' : action === 'cancel' ? 'Order cancelled' : action === 'ready' ? 'Order marked ready' : 'Pickup recorded'} successfully`)
      loadData()
      if (showOrderDetails?.id === orderId) {
        const updated = await salesOrderApi.getOrderById(orderId)
        const order = (updated.data as any)?.data || updated.data
        if (order) setShowOrderDetails(order)
      }
    } catch (err: any) {
      notify.error(err.message || `Failed to ${action} order`)
    }
  }

  const handleCreateInvoice = async (orderId: string) => {
    try {
      const [res, settingsRes] = await Promise.all([
        salesOrderApi.createInvoice({ salesOrderId: orderId }),
        settingsApi.getSettings()
      ])
      if (res.error) { notify.error(res.error.message); return }
      notify.success('Invoice created')
      const invoice = (res.data as any)?.data || res.data
      if (invoice) {
        const settingsData = (settingsRes.data as any)?.data ?? settingsRes.data
        if (settingsData) {
          setBusinessTin(settingsData.businessTin || '')
          setBusinessAddress(settingsData.businessAddress || '')
        }
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
      notify.error(err.message || 'Failed to create invoice')
    }
  }

  const openProductionJobView = async (jobId: string) => {
    try {
      const res = await productionApi.getJob(jobId)
      const job = (res.data as any)?.data || res.data
      if (job) {
        setViewingProductionJob(job as ProductionJob)
        setShowProductionJobModal(true)
      }
    } catch (err: any) {
      notify.error(err.message || 'Failed to load production job')
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

  const moveRollUp = (index: number) => {
    if (index <= 0) return
    const newRollIds = [...productionForm.rollIds]
    ;[newRollIds[index - 1], newRollIds[index]] = [newRollIds[index], newRollIds[index - 1]]
    setProductionForm({...productionForm, rollIds: newRollIds})
  }

  const moveRollDown = (index: number) => {
    if (index >= productionForm.rollIds.length - 1) return
    const newRollIds = [...productionForm.rollIds]
    ;[newRollIds[index], newRollIds[index + 1]] = [newRollIds[index + 1], newRollIds[index]]
    setProductionForm({...productionForm, rollIds: newRollIds})
  }

  const openProductionModal = async (order: SalesOrder) => {
    setProductionOrder(order)
    setProductionForm({
      machine: '',
      category: '',
      rollIds: [],
      printedRollWeights: '',
      rollWaste: {},
      rollConsumption: {},
      notes: ''
    })
    await loadAvailableRolls()
    setShowProductionModal(true)
  }

  const openPickupModal = (order: SalesOrder) => {
    setProductionOrder(order)
    const rolls = order.productionJob?.printedRolls || []
    setPickupRolls(rolls)
    setSelectedRollIds(rolls.map(r => r.id))

    const pbagMaterial = allMaterials.find((m: any) => m.code === 'PBAG')
    const defaultPrice = (pbagMaterial?.pricePerPack || 0) * (pbagMaterial?.packSize || 1)

    setPickupForm({
      packingBags: 0,
      packingBagPrice: defaultPrice,
      notes: '',
      date: new Date().toISOString().split('T')[0]
    })
    setShowPickupModal(true)
  }

  const handleStartProduction = async () => {
    if (!productionOrder) return
    if (!productionForm.machine) { notify.error('Machine is required'); return }
    if (productionForm.rollIds.length === 0) { notify.error('Select at least one parent roll'); return }

    const weights = productionForm.printedRollWeights.split(/[\s,]+/)
      .map(w => parseFloat(w))
      .filter(w => !isNaN(w) && w > 0)

    if (weights.length === 0 || weights.length > 35) {
      notify.error('Enter 1-35 roll weights (space or comma-separated)')
      return
    }

    const selectedRollsData = availableRolls.filter(r => productionForm.rollIds.includes(r.id))
    const totalEffectiveCapacity = selectedRollsData.reduce((sum, r) =>
      sum + Math.max(0, Number(r.remainingWeight || 0) + Number(r.weight || 0) * 0.10), 0)
    const totalPrintedWeight = weights.reduce((sum, w) => sum + w, 0)
    if (totalPrintedWeight > totalEffectiveCapacity) {
      notify.error(`Cannot create job: Printed weight (${totalPrintedWeight.toFixed(2)}kg) exceeds 110% effective capacity (${totalEffectiveCapacity.toFixed(2)}kg)`)
      return
    }

    const originalMaterial = productionOrder.specsJson?.materialType || ''
    const materialOverride = productionForm.category && productionForm.category !== originalMaterial ? productionForm.category : undefined

    try {
      const res = await salesOrderApi.startProduction(productionOrder.id, {
        machine: productionForm.machine,
        category: productionForm.category || undefined,
        materialOverride,
        rollIds: productionForm.rollIds,
        printedRollWeights: weights,
        rollWaste: Object.keys(productionForm.rollWaste).length > 0 ? productionForm.rollWaste : undefined,
        rollConsumption: Object.keys(productionForm.rollConsumption).some(k => productionForm.rollConsumption[k] > 0) ? productionForm.rollConsumption : undefined,
        notes: productionForm.notes || undefined
      })
      if (res.error) { notify.error(res.error.message); return }
      notify.success('Production started')
      setShowProductionModal(false)
      setProductionOrder(null)
      loadData()
      if (showOrderDetails?.id === productionOrder.id) {
        const updated = await salesOrderApi.getOrderById(productionOrder.id)
        const order = (updated.data as any)?.data || updated.data
        if (order) setShowOrderDetails(order)
      }
    } catch (err: any) {
      notify.error(err.message || 'Failed to start production')
    }
  }

  const handleRecordPickup = async () => {
    if (!productionOrder) return
    if (selectedRollIds.length === 0) { notify.error('Select at least one roll to pick up'); return }

    try {
      const res = await salesOrderApi.recordPickup(
        productionOrder.id,
        selectedRollIds,
        pickupForm.packingBags > 0 ? pickupForm.packingBags : undefined,
        pickupForm.packingBags > 0 && pickupForm.packingBagPrice > 0 ? pickupForm.packingBagPrice : undefined,
        pickupForm.date || undefined
      )
      if (res.error) { setShowPickupModal(false); setProductionOrder(null); setPickupRolls([]); setSelectedRollIds([]); notify.error(res.error.message); return }
      notify.success('Pickup recorded')
      setShowPickupModal(false)
      setProductionOrder(null)
      setPickupRolls([])
      setSelectedRollIds([])
      loadData()
      if (showOrderDetails?.id === productionOrder.id) {
        const updated = await salesOrderApi.getOrderById(productionOrder.id)
        const order = (updated.data as any)?.data || updated.data
        if (order) setShowOrderDetails(order)
      }
    } catch (err: any) {
      setShowPickupModal(false); setProductionOrder(null)
      setPickupRolls([])
      setSelectedRollIds([])
      notify.error(err.message || 'Failed to record pickup')
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
        if (Number(order.quantityDelivered) < Number(order.quantityOrdered)) {
          actions.push({ label: 'Record Pickup', action: 'pickup', variant: 'bg-teal-600 hover:bg-teal-700' })
        }
        break
    }
    return actions
  }

  const openPaymentModal = (order?: SalesOrder) => {
    setPaymentModalMode('payment')
    setPaymentForm({
      salesOrderId: order?.id || '',
      customerId: order?.customerId || '',
      paymentMethod: 'Cash',
      amount: order ? order.totalAmount - order.totalPaid : 0,
      referenceNumber: '',
      notes: '',
      date: new Date().toISOString().split('T')[0]
    })
    setShowPaymentModal(true)
  }

  const openDepositModal = () => {
    setPaymentModalMode('deposit')
    setPaymentForm({
      salesOrderId: '',
      customerId: '',
      paymentMethod: 'Cash',
      amount: 0,
      referenceNumber: '',
      notes: '',
      date: new Date().toISOString().split('T')[0]
    })
    setShowPaymentModal(true)
  }

  const coreBuybackValue = coreBuybackForm.coresQuantity * coreBuybackForm.ratePerCore

  const getCustomerDeposit = (customerId: string) => {
    return customerBalances.find(b => b.customerId === customerId)?.depositHeld || 0
  }

  const DepositBadge = ({ customerId }: { customerId: string }) => {
    const deposit = getCustomerDeposit(customerId)
    if (deposit <= 0) return null
    return <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Deposit: ₦{deposit.toLocaleString()}</span>
  }

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
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                    <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
                      <option value="">All Customers</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
                      <option value="">All Payments</option>
                      {Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) =>
                        <option key={key} value={key}>{label}</option>
                      )}
                    </select>
                    {(statusFilter || customerFilter || paymentFilter) && (
                      <button onClick={() => { setStatusFilter(''); setCustomerFilter(''); setPaymentFilter('') }} className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
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
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer select-none" onClick={() => setOrderSortDir(orderSortDir === 'desc' ? 'asc' : 'desc')}>
                          Date {orderSortDir === 'desc' ? '▼' : '▲'}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sortedOrders.length === 0 ? (
                        <tr><td colSpan={9} className="px-6 py-8 text-center text-slate-500">No orders found</td></tr>
                      ) : (
                        sortedOrders.map(o => (
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
                                {['PICKED_UP', 'COMPLETED'].includes(o.status) && o.paymentStatus !== 'FULLY_PAID' && o.paymentStatus !== 'OVERPAID' && (
                                  <button onClick={() => openPaymentModal(o)} className="px-2 py-1 bg-slate-600 text-white text-xs rounded hover:bg-slate-700">
                                    Pay
                                  </button>
                                )}
                                {o.invoices && o.invoices.length > 0 && (() => {
                                  const inv = o.invoices![0]
                                  return (
                                    <div className="relative invoice-dropdown-area inline-block">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setInvoiceDropdown(invoiceDropdown === inv.id ? null : inv.id) }}
                                        disabled={generatingInvoice === inv.id}
                                        className="px-2 py-1 bg-slate-700 text-white text-xs rounded hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        {generatingInvoice === inv.id ? '...' : 'Invoice'}
                                      </button>
                                      {invoiceDropdown === inv.id && (
                                        <div className="absolute left-0 mt-1 w-32 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                                          <button onClick={() => handlePrintInvoice(inv)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-t-lg border-b border-slate-100">
                                            🖨️ Print
                                          </button>
                                          <button onClick={() => handleDownloadInvoice(inv)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-b-lg">
                                            ⬇️ Download
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })()}
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
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="p-4 border-b border-slate-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <h2 className="font-semibold">Payment Transactions</h2>
                    <button onClick={openDepositModal} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                      + Deposit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { key: 'today', label: 'Today' },
                        { key: 'yesterday', label: 'Yesterday' },
                        { key: 'this-week', label: 'This Week' },
                        { key: 'last-week', label: 'Last Week' },
                        { key: 'this-month', label: 'This Month' },
                        { key: 'last-month', label: 'Last Month' },
                        { key: 'last-3-months', label: 'Last 3 Months' },
                      ].map(p => (
                        <button key={p.key}
                          onClick={() => applyPaymentPeriod(p.key)}
                          className={`px-3 py-1.5 text-sm rounded-lg border ${
                            paymentPeriod === p.key
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-4 items-center flex-wrap">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">From:</label>
                        <DateInput value={paymentDateFrom}
                          onChange={e => { setPaymentPeriod(''); setPaymentDateFrom(e.target.value); loadPayments(e.target.value || undefined, paymentDateTo || undefined) }}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">To:</label>
                        <DateInput value={paymentDateTo}
                          onChange={e => { setPaymentPeriod(''); setPaymentDateTo(e.target.value); loadPayments(paymentDateFrom || undefined, e.target.value || undefined) }}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      {(paymentPeriod || paymentDateFrom || paymentDateTo) && (
                        <button onClick={clearPaymentFilters}
                          className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer select-none" onClick={() => setPaymentSortDir(paymentSortDir === 'desc' ? 'asc' : 'desc')}>
                        Date {paymentSortDir === 'desc' ? '▼' : '▲'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reference</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedPayments.length === 0 ? (
                      <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">No payments found</td></tr>
                    ) : (
                      sortedPayments.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-600">{new Date(p.receivedAt).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              p.transactionType === 'DEPOSIT' ? 'bg-blue-100 text-blue-800' :
                              p.transactionType === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                              (p.transactionType as string) === 'CORE_CREDIT_APPLIED' ? 'bg-purple-100 text-purple-800' :
                              p.transactionType === 'DEPOSIT_APPLIED' ? 'bg-yellow-100 text-yellow-800' :
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
                          <td className="px-6 py-4 text-center relative receipt-dropdown-area">
                            <button
                              onClick={() => setReceiptDropdown(receiptDropdown === p.id ? null : p.id)}
                              disabled={generatingReceipt === p.id}
                              className="px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-300 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {generatingReceipt === p.id ? '...' : 'Receipt'}
                            </button>
                            {receiptDropdown === p.id && (
                              <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                                <button
                                  onClick={() => handlePrintReceipt(p.id)}
                                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg border-b border-slate-100"
                                >
                                  🖨️ Print
                                </button>
                                <button
                                  onClick={() => handleDownloadReceipt(p.id)}
                                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-b-lg"
                                >
                                  ⬇️ Download
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'invoices' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <div className="flex gap-4 flex-wrap">
                    <input
                      type="text"
                      placeholder="Search customer..."
                      value={invoiceCustomerSearch}
                      onChange={e => setInvoiceCustomerSearch(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm min-w-[200px]"
                    />
                    <select
                      value={invoiceStatusFilter}
                      onChange={e => setInvoiceStatusFilter(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="">All Statuses</option>
                      {Object.entries(INVOICE_STATUS_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    {(invoiceStatusFilter || invoiceCustomerSearch) && (
                      <button onClick={() => { setInvoiceStatusFilter(''); setInvoiceCustomerSearch('') }} className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Invoice #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Order #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Balance</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer select-none" onClick={() => setInvoiceSortDir(invoiceSortDir === 'desc' ? 'asc' : 'desc')}>
                          Date {invoiceSortDir === 'desc' ? '▼' : '▲'}
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredInvoices.length === 0 ? (
                        <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-500">No invoices found</td></tr>
                      ) : (
                        filteredInvoices.map(inv => (
                        <tr key={inv.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setCurrentInvoice(inv); setShowInvoiceModal(true) }}>
                            <td className="px-6 py-4 text-sm font-medium text-slate-900">{inv.invoiceNumber}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{inv.salesOrder?.orderNumber || '-'}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{inv.customer?.name || '-'}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] || 'bg-slate-100'}`}>
                                {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-900 text-right">₦{Number(inv.totalAmount).toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm text-red-600 text-right">₦{Number(inv.balanceDue).toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                            <td className="px-6 py-4 text-right relative">
                              <button
                                onClick={e => { e.stopPropagation(); setInvoiceDropdown(invoiceDropdown === inv.id ? null : inv.id) }}
                                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                              >
                                Invoice ▾
                              </button>
                              {invoiceDropdown === inv.id && (
                                <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                                  <button onClick={e => { e.stopPropagation(); handlePrintInvoice(inv); setInvoiceDropdown(null) }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg border-b border-slate-100">
                                    🖨️ Print
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); handleDownloadInvoice(inv); setInvoiceDropdown(null) }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100">
                                    ⬇️ Download
                                  </button>
                                  {inv.status !== 'PAID' && (
                                    <button onClick={e => { e.stopPropagation(); setCurrentInvoice(inv); setShowInvoiceModal(true); setInvoiceDropdown(null) }} className="w-full text-left px-4 py-2.5 text-sm text-green-700 hover:bg-slate-50 rounded-b-lg">
                                      💳 Pay
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'core-buyback' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="p-4 border-b border-slate-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <h2 className="font-semibold">Core Buybacks</h2>
                    <button onClick={() => {
                      const stored = localStorage.getItem('appSettings')
                      let defaultRate = 150
                      if (stored) { try { const s = JSON.parse(stored); if (s.coreDepositValue) defaultRate = Number(s.coreDepositValue) } catch {} }
                      setCoreBuybackForm(prev => ({ ...prev, ratePerCore: defaultRate }))
                      setShowCoreBuybackModal(true)
                    }} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                      + New Buyback
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { key: 'today', label: 'Today' },
                        { key: 'yesterday', label: 'Yesterday' },
                        { key: 'this-week', label: 'This Week' },
                        { key: 'last-week', label: 'Last Week' },
                        { key: 'this-month', label: 'This Month' },
                        { key: 'last-month', label: 'Last Month' },
                        { key: 'last-3-months', label: 'Last 3 Months' },
                      ].map(p => (
                        <button key={p.key}
                          onClick={() => applyCoreBuybackPeriod(p.key)}
                          className={`px-3 py-1.5 text-sm rounded-lg border ${
                            coreBuybackPeriod === p.key
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-4 items-center flex-wrap">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">From:</label>
                        <DateInput value={coreBuybackDateFrom}
                          onChange={e => { setCoreBuybackPeriod(''); setCoreBuybackDateFrom(e.target.value); loadCoreBuybacks(e.target.value || undefined, coreBuybackDateTo || undefined) }}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">To:</label>
                        <DateInput value={coreBuybackDateTo}
                          onChange={e => { setCoreBuybackPeriod(''); setCoreBuybackDateTo(e.target.value); loadCoreBuybacks(coreBuybackDateFrom || undefined, e.target.value || undefined) }}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      {(coreBuybackPeriod || coreBuybackDateFrom || coreBuybackDateTo) && (
                        <button onClick={clearCoreBuybackFilters}
                          className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer select-none" onClick={() => setCoreBuybackSortDir(coreBuybackSortDir === 'desc' ? 'asc' : 'desc')}>
                        Date {coreBuybackSortDir === 'desc' ? '▼' : '▲'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer/Seller</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Cores</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedCoreBuybacks.length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No core buybacks found</td></tr>
                    ) : (
                      sortedCoreBuybacks.map(cb => (
                        <tr key={cb.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-600">{new Date(cb.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{cb.customer?.name || cb.sellerName || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-900 text-right">{cb.coresQuantity}</td>
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
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Outstanding</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Deposit Held</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Available Credit</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Pending Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {customerBalances.length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No customer balances found</td></tr>
                    ) : (
                      customerBalances.map(cb => (
                        <tr key={cb.customerId} className="hover:bg-slate-50 cursor-pointer" onClick={() => setShowCustomerBalance(cb)}>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{cb.customerName}</td>
                          <td className="px-6 py-4 text-sm text-red-600 text-right">₦{Number(cb.totalOutstanding).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-blue-600 text-right">₦{Number(cb.depositHeld).toLocaleString()}</td>
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
                            min="0"
                            step="any"
                            value={packingBagForm.quantity || ''}
                            onChange={e => setPackingBagForm({...packingBagForm, quantity: parseFloat(e.target.value) || 0})}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                          required
                        />
                        {allMaterials.find(m => m.code === 'PBAG')?.packSize && packingBagForm.quantity > 0 && (
                          <p className="text-xs text-slate-500 mt-1">{packingBagForm.quantity} bundle{packingBagForm.quantity !== 1 ? 's' : ''} = {packingBagForm.quantity * allMaterials.find(m => m.code === 'PBAG')!.packSize!} pack{allMaterials.find(m => m.code === 'PBAG')!.packSize! > 1 ? 's' : ''}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Price per Bundle (₦)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
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
                        {allMaterials.find(m => m.code === 'PBAG')?.packSize && allMaterials.find(m => m.code === 'PBAG')?.pricePerPack && (
                          <p className="text-xs text-teal-600 mt-1">
                            {packingBagForm.quantity * allMaterials.find(m => m.code === 'PBAG')!.packSize!} pack{packingBagForm.quantity * allMaterials.find(m => m.code === 'PBAG')!.packSize! !== 1 ? 's' : ''} @ ₦{allMaterials.find(m => m.code === 'PBAG')!.pricePerPack!.toLocaleString()}/pack
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                      <select 
                        value={packingBagForm.paymentMethod} 
                        onChange={e => setPackingBagForm({...packingBagForm, paymentMethod: e.target.value as 'Cash' | 'Electronic'})} 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Electronic">Electronic</option>
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

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                      <DateInput value={packingBagForm.date} onChange={e => setPackingBagForm({...packingBagForm, date: e.target.value})} max={new Date().toISOString().split('T')[0]} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
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
                  {orderForm.customerId && <DepositBadge customerId={orderForm.customerId} />}
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
                      min="0.1"
                      step="any"
                      value={orderForm.quantity || ''}
                      onChange={e => setOrderForm({...orderForm, quantity: parseFloat(e.target.value) || 0})}
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
                  <DateInput value={orderForm.expectedDeliveryDate} onChange={e => setOrderForm({...orderForm, expectedDeliveryDate: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
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

        {/* Payment / Deposit Modal */}
        {showPaymentModal && (() => {
          const isPayment = paymentModalMode === 'payment'
          const order = isPayment ? orders.find(o => o.id === paymentForm.salesOrderId) : null
          const title = isPayment ? `Record Payment${order ? ` — ${order.orderNumber}` : ''}` : 'Record Deposit'
          return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">{title}</h2>
              <form onSubmit={handleRecordPayment} className="space-y-4">
                {isPayment ? (
                  <>
                    {order && (
                      <div className="p-3 bg-slate-50 rounded-lg space-y-1 text-sm">
                        <div><span className="text-slate-500">Customer: </span><span className="font-medium">{order.customer?.name || 'N/A'}</span></div>
                        <div><span className="text-slate-500">Order: </span><span className="font-medium">{order.orderNumber}</span></div>
                        <div className="flex justify-between items-center pt-1 border-t border-slate-200 mt-1">
                          <span className="text-slate-500">Balance Due:</span>
                          <span className="font-bold text-teal-600">₦{Number(order.totalAmount - order.totalPaid).toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                    {paymentForm.customerId && <DepositBadge customerId={paymentForm.customerId} />}
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Customer <span className="text-red-500">*</span></label>
                    <select value={paymentForm.customerId} onChange={e => setPaymentForm({...paymentForm, customerId: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required>
                      <option value="">Select customer</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {paymentForm.customerId && <DepositBadge customerId={paymentForm.customerId} />}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                  <select value={paymentForm.paymentMethod} onChange={e => setPaymentForm({...paymentForm, paymentMethod: e.target.value as PaymentMethod})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                    <option value="Cash">Cash</option>
                    <option value="Electronic">Electronic</option>
                    <option value="CORE_CREDIT">Core Credit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦) <span className="text-red-500">*</span></label>
                  <input type="number" min="1" value={paymentForm.amount || ''} onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <DateInput value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} max={new Date().toISOString().split('T')[0]} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
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
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg">{isPayment ? 'Record Payment' : 'Record Deposit'}</button>
                </div>
              </form>
            </div>
          </div>
          )
        })()}

        {/* Core Buyback Modal */}
        {showCoreBuybackModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Core Buyback</h2>
              <form onSubmit={handleRecordCoreBuyback} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer (for credit)</label>
                  <select value={coreBuybackForm.customerId} onChange={e => setCoreBuybackForm({...coreBuybackForm, customerId: e.target.value, sellerName: ''})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                    <option value="">-- Select customer (optional) --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {coreBuybackForm.customerId && <DepositBadge customerId={coreBuybackForm.customerId} />}
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
                  <label className="block text-sm font-medium text-purple-800 mb-1">Rate (₦ per core)</label>
                  <input type="number" min="1" value={coreBuybackForm.ratePerCore || ''}
                    onChange={e => setCoreBuybackForm({...coreBuybackForm, ratePerCore: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-1.5 border border-purple-300 rounded-lg text-sm font-medium text-purple-800 bg-white"
                  />
                  {coreBuybackValue > 0 && (
                    <span className="block text-lg font-bold text-purple-700 mt-2">Total: ₦{coreBuybackValue.toLocaleString()}</span>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                  <select value={coreBuybackForm.paymentMethod} onChange={e => setCoreBuybackForm({...coreBuybackForm, paymentMethod: e.target.value as PaymentMethod})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                    <option value="Cash">Cash</option>
                    <option value="Electronic">Electronic</option>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Material</label>
                  <select 
                    value={productionForm.category} 
                    onChange={e => {
                      setProductionForm({...productionForm, category: e.target.value})
                      loadAvailableRolls(e.target.value || undefined)
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="">All Categories</option>
                    {(() => {
                      const subs = [...new Set(allMaterials
                        .filter(m => m.subCategory && (m as any).category !== 'INK_SOLVENTS' && (m as any).category !== 'PACKAGING')
                        .map(m => m.subCategory!))]
                      return subs.map(sc => (
                        <option key={sc} value={sc}>
                          {sc.endsWith('microns') ? sc.charAt(0).toUpperCase() + sc.slice(1) : sc}
                        </option>
                      ))
                    })()}
                  </select>
                  {(() => {
                    const orig = productionOrder.specsJson?.materialType || ''
                    const selected = productionForm.category
                    if (selected && orig && selected !== orig) {
                      return (
                        <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg">
                          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                          <span className="text-sm text-amber-800">Material changed: <strong>{orig}</strong> → <strong>{selected}</strong></span>
                        </div>
                      )
                    }
                    return null
                  })()}
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
                  ) : (<>
                    <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-2 space-y-1">
                      {availableRolls.map(roll => {
                        const isChecked = productionForm.rollIds.includes(roll.id)
                        return (
                        <div key={roll.id}>
                          <label className="flex items-center p-2 hover:bg-slate-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setProductionForm({...productionForm, rollIds: [...productionForm.rollIds, roll.id]})
                                } else {
                                  const { [roll.id]: _, ...restWaste } = productionForm.rollWaste
                                  setProductionForm({...productionForm, rollIds: productionForm.rollIds.filter(id => id !== roll.id), rollWaste: restWaste})
                                }
                              }}
                              className="mr-2"
                            />
                            <span className="text-sm">
                              {roll.rollNumber} - {Number(roll.remainingWeight).toFixed(1)}kg ({roll.material?.subCategory || 'N/A'})
                            </span>
                          </label>
                          {isChecked && (
                            <div className="ml-6 mb-1 flex items-center gap-2">
                              <span className="text-xs text-slate-500">Waste:</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={productionForm.rollWaste[roll.id] ?? 0}
                                onFocus={e => e.target.select()}
                                onChange={e => {
                                  setProductionForm({
                                    ...productionForm,
                                    rollWaste: { ...productionForm.rollWaste, [roll.id]: Math.max(0, parseFloat(e.target.value) || 0) }
                                  })
                                }}
                                className="w-20 px-2 py-1 text-xs border border-slate-300 rounded"
                              />
                              <span className="text-xs text-slate-400">kg</span>
                            </div>
                          )}
                        </div>
                      )})}
                    </div>
                    {productionForm.rollIds.length > 1 && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Consumption Order <span className="text-xs text-slate-400 font-normal">(use ▲▼ to set which roll is consumed first; optionally set exact kg for the first printed roll)</span></label>
                        <div className="border border-slate-300 rounded-lg p-2 space-y-1">
                          {productionForm.rollIds.map((rollId, index) => {
                            const roll = availableRolls.find(r => r.id === rollId)
                            if (!roll) return null
                            return (
                              <div key={rollId} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded">
                                <span className="text-xs font-medium text-slate-400 w-5">{index + 1}.</span>
                                <span className="text-sm w-40">{roll.rollNumber} ({Number(roll.remainingWeight).toFixed(1)}kg)</span>
                                {index === 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-slate-500">Take:</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={productionForm.rollConsumption[roll.id] ?? ''}
                                      onFocus={e => e.target.select()}
                                      onChange={e => {
                                        const val = e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value) || 0)
                                        setProductionForm({
                                          ...productionForm,
                                          rollConsumption: { ...productionForm.rollConsumption, [roll.id]: val ?? 0 }
                                        })
                                      }}
                                      className="w-16 px-1.5 py-0.5 text-xs border border-slate-300 rounded"
                                      placeholder="kg"
                                    />
                                    <span className="text-xs text-slate-400">kg</span>
                                  </div>
                                )}
                                {index > 0 && <div className="w-24" />}
                                <button
                                  type="button"
                                  onClick={() => moveRollUp(index)}
                                  disabled={index === 0}
                                  className="px-1.5 py-0.5 text-xs border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                >▲</button>
                                <button
                                  type="button"
                                  onClick={() => moveRollDown(index)}
                                  disabled={index === productionForm.rollIds.length - 1}
                                  className="px-1.5 py-0.5 text-xs border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                >▼</button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>)}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Printed Roll Weights (space or comma-separated, kg) - max 35 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={productionForm.printedRollWeights}
                    onChange={e => setProductionForm({...productionForm, printedRollWeights: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    placeholder="e.g. 14.5, 16, 18.2 or 14.5 16 18.2"
                  />
                  {(() => {
                    const weights = productionForm.printedRollWeights.split(/[\s,]+/)
                      .map(w => parseFloat(w))
                      .filter(w => !isNaN(w) && w > 0)
                    const totalPrintedWeight = weights.reduce((sum, w) => sum + w, 0)
                    const totalWaste = Object.values(productionForm.rollWaste).reduce((sum, w) => sum + w, 0)
                    const selectedRollsData = availableRolls.filter(r => productionForm.rollIds.includes(r.id))
                    const totalRemainingWeight = selectedRollsData.reduce((sum, r) => sum + Number(r.remainingWeight || 0), 0)
                    const totalEffectiveCapacity = selectedRollsData.reduce((sum, r) =>
                      sum + Math.max(0, Number(r.remainingWeight || 0) + Number(r.weight || 0) * 0.10), 0)
                    const remaining = totalEffectiveCapacity - totalPrintedWeight - totalWaste
                    const withinTolerance = remaining >= 0
                    return (
                      <div className="flex justify-between items-center mt-1">
                        {weights.length > 0 && (
                          <p className="text-sm text-slate-600">
                            {weights.length} rolls, {totalPrintedWeight.toFixed(2)}kg total
                          </p>
                        )}
                        {selectedRollsData.length > 0 && (
                          <p className={`text-sm font-medium ${
                            !withinTolerance
                              ? 'text-red-600'
                              : totalPrintedWeight <= totalRemainingWeight
                                ? 'text-green-600'
                                : 'text-yellow-600'
                          }`}>
                            {totalPrintedWeight <= totalRemainingWeight
                              ? `Remaining: ${(totalRemainingWeight - totalPrintedWeight - totalWaste).toFixed(2)}kg`
                              : withinTolerance
                                ? `Over by ${(totalPrintedWeight + totalWaste - totalRemainingWeight).toFixed(2)}kg (within 10% tolerance)`
                                : `Exceeds tolerance by ${(totalPrintedWeight + totalWaste - totalEffectiveCapacity).toFixed(2)}kg`}
                          </p>
                        )}
                      </div>
                    )
                  })()}
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
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Record Pickup - {productionOrder.orderNumber}</h2>

              {/* Roll Selection */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Select Rolls to Pick Up</label>
                  {pickupRolls.length > 0 && (
                    <button
                      onClick={() => {
                        if (selectedRollIds.length === pickupRolls.length) {
                          setSelectedRollIds([])
                        } else {
                          setSelectedRollIds(pickupRolls.map(r => r.id))
                        }
                      }}
                      className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                    >
                      {selectedRollIds.length === pickupRolls.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
                {pickupRolls.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-500 text-center">
                    No rolls available for pickup. All rolls from this production job have already been picked up.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg max-h-[55vh] overflow-y-auto p-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {pickupRolls.map((roll) => {
                        const selected = selectedRollIds.includes(roll.id)
                        return (
                          <label
                            key={roll.id}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer border transition-colors text-sm ${
                              selected
                                ? 'bg-teal-50 border-teal-300'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                if (selected) {
                                  setSelectedRollIds(prev => prev.filter(id => id !== roll.id))
                                } else {
                                  setSelectedRollIds(prev => [...prev, roll.id])
                                }
                              }}
                              className="w-3.5 h-3.5 text-teal-600 rounded border-slate-300 shrink-0"
                            />
                            <span className={`font-medium ${selected ? 'text-teal-700' : 'text-slate-700'}`}>
                              {Number(roll.weightUsed).toFixed(1)} kg
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Summary */}
              {(() => {
                const selectedWeight = pickupRolls
                  .filter(r => selectedRollIds.includes(r.id))
                  .reduce((sum, r) => sum + Number(r.weightUsed), 0)
                const unitPrice = Number(productionOrder.unitPrice || 0)
                const deliveryValue = selectedWeight * unitPrice
                const bagValue = pickupForm.packingBags > 0 && pickupForm.packingBagPrice > 0
                  ? pickupForm.packingBags * pickupForm.packingBagPrice
                  : 0
                const totalValue = deliveryValue + bagValue
                return (
                  <div className="mb-4 p-3 bg-teal-50 rounded-lg border border-teal-200">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-slate-500">Selected Rolls:</span>
                        <span className="ml-2 font-medium">{selectedRollIds.length} / {pickupRolls.length}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Total Weight:</span>
                        <span className="ml-2 font-medium">{selectedWeight.toFixed(1)} kg</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Unit Price:</span>
                        <span className="ml-2 font-medium">₦{unitPrice.toLocaleString()}/kg</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Delivery Value:</span>
                        <span className="ml-2 font-medium text-teal-600">₦{deliveryValue.toLocaleString()}</span>
                      </div>
                      {bagValue > 0 && (
                        <div>
                          <span className="text-slate-500">Packing Bags:</span>
                          <span className="ml-2 font-medium text-teal-600">+₦{bagValue.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="border-t border-teal-300 pt-1 mt-1 col-span-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-semibold text-slate-700">Total Pickup Value:</span>
                          <span className="font-bold text-teal-700">₦{totalValue.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              <div className="space-y-4">
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

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <DateInput value={pickupForm.date} onChange={e => setPickupForm({...pickupForm, date: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
                </div>

                <div className="border-t border-slate-200 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-3">Packing Bags (Optional)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Quantity (bundles)</label>
                          <input
                            type="number"
                            value={pickupForm.packingBags || ''}
                            onChange={e => setPickupForm({...pickupForm, packingBags: parseFloat(e.target.value) || 0})}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                            min="0"
                            step="any"
                        placeholder="0"
                      />
                      {allMaterials.find(m => m.code === 'PBAG')?.packSize && pickupForm.packingBags > 0 && (
                        <p className="text-xs text-slate-400 mt-1">{pickupForm.packingBags} bundle{pickupForm.packingBags !== 1 ? 's' : ''} = {pickupForm.packingBags * allMaterials.find(m => m.code === 'PBAG')!.packSize!} pack{allMaterials.find(m => m.code === 'PBAG')!.packSize! > 1 ? 's' : ''}</p>
                      )}
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
                  <button onClick={handleRecordPickup} disabled={selectedRollIds.length === 0} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">Record Pickup</button>
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
                    <p className="text-sm font-medium">{showOrderDetails.customer?.name}<DepositBadge customerId={showOrderDetails.customerId} /></p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Status</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[showOrderDetails.status]}`}>
                      {ORDER_STATUS_LABELS[showOrderDetails.status]}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Expected Delivery</p>
                    <p className="text-sm font-medium">{showOrderDetails.expectedDeliveryDate ? new Date(showOrderDetails.expectedDeliveryDate).toLocaleDateString() : 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Delivery Method</p>
                    <p className="text-sm font-medium">{showOrderDetails.deliveryMethod === 'SHIPPING' ? 'Shipping' : 'Pickup'}</p>
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
                      {showOrderDetails.productionJobId && (
                        <p className="text-xs mt-1">
                          {showOrderDetails.productionJob?.jobNumber ? (
                            <button onClick={() => openProductionJobView(showOrderDetails.productionJobId!)} className="text-indigo-600 hover:text-indigo-800 font-medium underline">
                              {showOrderDetails.productionJob.jobNumber}
                            </button>
                          ) : (
                            <button onClick={() => openProductionJobView(showOrderDetails.productionJobId!)} className="text-indigo-600 hover:text-indigo-800 underline">
                              View Production Job
                            </button>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500">Created: {new Date(showOrderDetails.createdAt).toLocaleDateString()}</p>
                  <div className="flex space-x-2">
                    {showOrderDetails.paymentStatus !== 'FULLY_PAID' && showOrderDetails.paymentStatus !== 'OVERPAID' && (() => {
                      const deposit = getCustomerDeposit(showOrderDetails.customerId)
                      const disabled = deposit > 0 && showOrderDetails.status !== 'PICKED_UP'
                      return (
                        <button
                          onClick={() => { if (!disabled) { setShowOrderDetails(null); openPaymentModal(showOrderDetails) }}}
                          className={`px-4 py-2 rounded-lg ${disabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                          title={disabled ? `Customer has ₦${deposit.toLocaleString()} deposit — complete pickup first to auto-apply` : 'Record Payment'}
                        >
                          Record Payment
                        </button>
                      )
                    })()}
                    {getAvailableActions(showOrderDetails).map(a => (
                      <button
                        key={a.action}
                        onClick={() => {
                          if (a.action === 'pickup') { setShowOrderDetails(null); openPickupModal(showOrderDetails) }
                          else if (a.action === 'startProduction') { setShowOrderDetails(null); handleOrderAction(showOrderDetails.id, a.action as any, showOrderDetails) }
                          else if (a.action === 'viewProduction') navigate('/production')
                          else if (a.action === 'invoice') handleCreateInvoice(showOrderDetails.id)
                          else handleOrderAction(showOrderDetails.id, a.action as any)
                        }}
                        className={`px-4 py-2 text-white rounded-lg ${a.variant}`}
                      >
                        {a.label}
                      </button>
                    ))}
                    {showOrderDetails.invoices && showOrderDetails.invoices.length > 0 && (() => {
                      const inv = showOrderDetails.invoices[0]
                      return (
                        <div className="relative invoice-dropdown-area inline-block">
                          <button
                            onClick={() => { setInvoiceDropdown(invoiceDropdown === inv.id ? null : inv.id) }}
                            disabled={generatingInvoice === inv.id}
                            className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
                          >
                            {generatingInvoice === inv.id ? '...' : 'Invoice'}
                          </button>
                          {invoiceDropdown === inv.id && (
                            <div className="absolute left-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                              <button onClick={() => handlePrintInvoice(inv)} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg border-b border-slate-100">
                                🖨️ Print
                              </button>
                              <button onClick={() => handleDownloadInvoice(inv)} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-b-lg">
                                ⬇️ Download
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    <button
                      onClick={() => setShowOrderDetails(null)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Production Job View Modal */}
        {showProductionJobModal && viewingProductionJob && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Job: {viewingProductionJob.jobNumber}</h2>
                  <p className="text-sm text-slate-500">Customer: {viewingProductionJob.customerName || '-'}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${PROD_STATUS_COLORS[viewingProductionJob.status] || 'bg-slate-100'}`}>
                  {viewingProductionJob.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm mb-6">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Machine</span>
                  <span className="text-slate-900 font-medium">{viewingProductionJob.machine}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Total Printed</span>
                  <span className="text-slate-900 font-medium">
                    {viewingProductionJob.printedRolls?.reduce((sum, pr) => sum + Number(pr.weightUsed), 0).toFixed(2) || '0'} kg
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Total Waste</span>
                  <span className="text-slate-900 font-medium">
                    {(() => {
                      const rw = viewingProductionJob.rollWaste as Record<string, number> | undefined
                      if (rw) return Object.values(rw).reduce((s, v) => s + v, 0).toFixed(2) + ' kg'
                      return (Number(viewingProductionJob.wasteWeight || 0)).toFixed(2) + ' kg'
                    })()}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Started</span>
                  <span className="text-slate-900 font-medium">
                    {viewingProductionJob.startDate ? new Date(viewingProductionJob.startDate).toLocaleDateString() : '-'}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Completed</span>
                  <span className="text-slate-900 font-medium">
                    {viewingProductionJob.endDate ? new Date(viewingProductionJob.endDate).toLocaleDateString() : '-'}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500 block text-xs">Created</span>
                  <span className="text-slate-900 font-medium">
                    {new Date(viewingProductionJob.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {viewingProductionJob.materialOverride && (
                <div className="mb-6 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  <span>Material override: <strong>{viewingProductionJob.materialOverride}</strong></span>
                </div>
              )}

              {/* Parent Rolls */}
              {(viewingProductionJob.parentRolls || (viewingProductionJob.parentRollIds && viewingProductionJob.parentRollIds.length > 0)) && (
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
                          const mapping = viewingProductionJob.printedRollMapping as Record<string, any> || {}
                          const contributedMap: Record<string, number> = {}
                          if (viewingProductionJob.printedRolls) {
                            for (const p of viewingProductionJob.printedRolls) {
                              const e = mapping[p.id]
                              if (typeof e === 'object' && e !== null) {
                                for (const [pid, cw] of Object.entries(e)) {
                                  contributedMap[pid] = (contributedMap[pid] || 0) + Number(cw)
                                }
                              }
                            }
                          }
                          const rollWaste = viewingProductionJob.rollWaste as Record<string, number> | undefined
                          return (viewingProductionJob.parentRolls || []).map((pr) => {
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
                        {!viewingProductionJob.parentRolls && viewingProductionJob.parentRollIds?.map((id) => (
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

              {/* Printed Rolls */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Printed Rolls ({viewingProductionJob.printedRolls?.length || 0})</h3>
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
                      {viewingProductionJob.printedRolls?.map((pr, idx) => {
                        const mapping = viewingProductionJob.printedRollMapping as Record<string, any> || {}
                        const entry = mapping[pr.id]
                        let parentInfo: string[] = []
                        if (typeof entry === 'object' && entry !== null) {
                          const parentRollsMap = new Map((viewingProductionJob.parentRolls || []).map(r => [r.id, r]))
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
                      {(!viewingProductionJob.printedRolls || viewingProductionJob.printedRolls.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-4 py-4 text-sm text-slate-500 text-center">No printed rolls</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {viewingProductionJob.notes && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <span className="text-yellow-800 text-xs font-medium">Notes:</span>
                  <p className="text-yellow-900 mt-1 text-sm">{viewingProductionJob.notes}</p>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-slate-200">
                <button type="button" onClick={() => { setShowProductionJobModal(false); setViewingProductionJob(null) }} className="px-4 py-2 border border-slate-300 rounded-lg">Close</button>
              </div>
            </div>
          </div>
        )}

          {showDepositConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-3">Deposit Available</h3>
                <p className="text-sm text-slate-600 mb-6">
                  This customer has ₦{packingBagDeposit.toLocaleString()} available deposit. Would you like it applied for this sale?
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={async () => { setShowDepositConfirm(false); await submitPackingBagSale(false) }}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    No
                  </button>
                  <button
                    onClick={async () => { setShowDepositConfirm(false); await submitPackingBagSale(true) }}
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>
          )}
          </>
        )}

        {/* Customer Balance Modal */}
        {showCustomerBalance && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCustomerBalance(null)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-4">{showCustomerBalance.customerName}</h2>
              <div className="space-y-4">
                <div className="p-4 bg-red-50 rounded-xl">
                  <p className="text-xs text-red-600">Total Outstanding</p>
                  <p className="text-2xl font-bold text-red-700">₦{Number(showCustomerBalance.totalOutstanding).toLocaleString()}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl">
                  <p className="text-xs text-blue-600">Deposit Held</p>
                  <p className="text-lg font-bold text-blue-700">₦{Number(showCustomerBalance.depositHeld).toLocaleString()}</p>
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

              <div className="relative space-y-4">
                {/* PAID stamp overlay */}
                {currentInvoice.status === 'PAID' && (
                  <div className="absolute inset-0 z-10 pointer-events-none select-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[30deg] text-6xl font-black text-green-500/15 border-[6px] border-green-500/20 rounded-xl px-6 py-3 uppercase tracking-widest">
                      PAID
                    </div>
                    <div className="absolute top-3 right-3 flex items-center gap-2 bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      PAID {currentInvoice.paidAt ? new Date(currentInvoice.paidAt).toLocaleDateString() : ''}
                    </div>
                  </div>
                )}

                  <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-xs text-slate-500">Invoice #</p>
                    <p className="font-medium">{currentInvoice.invoiceNumber}</p>
                    <p className="text-xs text-slate-500 mt-2">Order #</p>
                    <p className="font-medium">{currentInvoice.salesOrder?.orderNumber || '-'}</p>
                    {businessTin && <p className="text-xs text-slate-500 mt-2">TIN: {businessTin}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Date</p>
                    <p className="font-medium">{new Date(currentInvoice.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500">Customer</p>
                  <p className="font-medium">{currentInvoice.customer?.name || currentInvoice.salesOrder?.customer?.name || 'N/A'}<DepositBadge customerId={currentInvoice.customerId} /></p>
                </div>

                {businessAddress && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-xs text-slate-500">Business Address</p>
                    <p className="text-sm whitespace-pre-wrap">{businessAddress}</p>
                  </div>
                )}

                <div className="border rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Qty</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Unit</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Amount (excl. VAT)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(Number(currentInvoice.subtotal) || 0) > 0 && (
                        <tr>
                          <td className="px-4 py-2">Printed Rolls</td>
                          <td className="px-4 py-2 text-right">{Number(currentInvoice.quantityDelivered || 0).toFixed(1)}</td>
                          <td className="px-4 py-2 text-right">kg</td>
                          <td className="px-4 py-2 text-right">₦{(Number(currentInvoice.subtotal) || 0).toLocaleString()}</td>
                        </tr>
                      )}
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
                        <td colSpan={3} className="px-4 py-2 text-right font-medium">Subtotal (excl. VAT):</td>
                        <td className="px-4 py-2 text-right">₦{(Number(currentInvoice.subtotal) + Number(currentInvoice.packingBagsSubtotal || 0)).toLocaleString()}</td>
                      </tr>
                      {Number(currentInvoice.vatAmount) > 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-right text-xs">VAT (7.5%):</td>
                          <td className="px-4 py-2 text-right text-xs">₦{(Number(currentInvoice.vatAmount) || 0).toLocaleString()}</td>
                        </tr>
                      )}
                      <tr className="font-bold">
                        <td colSpan={3} className="px-4 py-2 text-right">Total (incl. VAT):</td>
                        <td className="px-4 py-2 text-right">₦{(Number(currentInvoice.totalAmount) || 0).toLocaleString()}</td>
                      </tr>
                      <tr className="border-t">
                        <td colSpan={3} className="px-4 py-2 text-right font-medium">Deposit Applied:</td>
                        <td className="px-4 py-2 text-right">-₦{(Number(currentInvoice.depositApplied) || 0).toLocaleString()}</td>
                      </tr>
                      {Number(currentInvoice.previousPayments) > 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-right font-medium">Previous Payments:</td>
                          <td className="px-4 py-2 text-right">-₦{(Number(currentInvoice.previousPayments) || 0).toLocaleString()}</td>
                        </tr>
                      )}
                      {Number(currentInvoice.balanceDue) > 0 && (
                        <tr className="text-red-600 font-bold">
                          <td colSpan={3} className="px-4 py-2 text-right">Balance Due:</td>
                          <td className="px-4 py-2 text-right">₦{(Number(currentInvoice.balanceDue) || 0).toLocaleString()}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>

                <div className="flex justify-end gap-3">
                  {currentInvoice.status !== 'PAID' && (
                    <button
                      onClick={() => {
                        setPaymentModalMode('payment')
                        setPaymentForm({
                          salesOrderId: currentInvoice.salesOrderId,
                          customerId: currentInvoice.customerId,
                          paymentMethod: 'Cash',
                          amount: Number(currentInvoice.balanceDue) || 0,
                          referenceNumber: '',
                          notes: '',
                          date: new Date().toISOString().split('T')[0]
                        })
                        setShowPaymentModal(true)
                      }}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Pay ₦{(Number(currentInvoice.balanceDue) || 0).toLocaleString()}
                    </button>
                  )}
                  <div className="relative invoice-dropdown-area inline-block">
                    <button
                      onClick={() => { setInvoiceDropdown(invoiceDropdown === currentInvoice.id ? null : currentInvoice.id) }}
                      disabled={generatingInvoice === currentInvoice.id}
                      className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
                    >
                      {generatingInvoice === currentInvoice.id ? '...' : 'Invoice'}
                    </button>
                    {invoiceDropdown === currentInvoice.id && (
                      <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                        <button onClick={() => handlePrintInvoice(currentInvoice)} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg border-b border-slate-100">
                          🖨️ Print
                        </button>
                        <button onClick={() => handleDownloadInvoice(currentInvoice)} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-b-lg">
                          ⬇️ Download
                        </button>
                      </div>
                    )}
                  </div>
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
