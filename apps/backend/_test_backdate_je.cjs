const http = require('http')
const data = JSON.stringify({ customerId: 'cm8ifp0b8000017y4cw744fbk', transactionType: 'DEPOSIT', paymentMethod: 'Cash', amount: 1000, date: '2026-07-01' })
const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/sales-orders/payments', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, 'user-id': 'test' } }, res => {
  let body = ''
  res.on('data', c => body += c)
  res.on('end', () => {
    const r = JSON.parse(body)
    if (r.error) { console.log('ERROR:', r.error.message || r.error); process.exit(1) }
    console.log('PAYMENT ID:', r.data?.id || r.data?.paymentId)

    // Now fetch the Journal Entry for this payment
    const jid = r.data?.id || r.data?.paymentId
    if (!jid) { console.log('No payment id returned'); process.exit(1) }

    http.get(`http://localhost:3000/api/finance/journal-entries?sourceId=${jid}`, res2 => {
      let b2 = ''
      res2.on('data', c => b2 += c)
      res2.on('end', () => {
        const jes = JSON.parse(b2)
        console.log('\nJOURNAL ENTRIES:')
        ;(jes.data || jes).forEach((je, i) => {
          console.log(`  JE ${i+1}: date=${je.date}, postedAt=${je.postedAt}, entryNumber=${je.entryNumber}`)
          if (i === 0) {
            const d = new Date(je.date)
            const p = new Date(je.postedAt)
            console.log(`    date=${d.toISOString().split('T')[0]}, postedAt=${p.toISOString().split('T')[0]}`)
            if (d.toISOString().split('T')[0] === '2026-07-01' && p.toISOString().split('T')[0] !== '2026-07-01') {
              console.log('    ✅ BACKDATE VERIFIED: date=${d.toISOString().split('T')[0]} != postedAt=${p.toISOString().split('T')[0]}')
            } else if (d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]) {
              console.log('    ❌ FAIL: JE date is today, not 2026-07-01')
            } else {
              console.log(`    date=${d.toISOString().split('T')[0]}, expected 2026-07-01`)
            }
          }
        })
      })
    })
  })
})
req.write(data)
req.end()
