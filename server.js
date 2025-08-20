
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const xml2js = require('xml2js');
const { randomUUID } = require('crypto');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// --- In-memory storage for demo purposes ---
let appSettings = {
  tally: {
    server: '127.0.0.1',
    port: '9000',
    company: '',
    lastSync: null,
    autoSync: false,
    syncInterval: 15,
  },
  email: {
    enabled: true,
    smtpHost: 'smtp.example.com',
    smtpPort: '587',
    username: 'user@example.com',
    fromName: 'Your Company',
    fromEmail: 'noreply@yourcompany.com',
  },
  sms: { enabled: false, provider: 'twilio', accountSid: '', fromNumber: '' },
  whatsapp: { enabled: false, provider: 'twilio', accountSid: '', fromNumber: '' },
};

// --- Tally Integration and Real XML Parsing Logic ---

/**
 * Sends the specified XML request to the Tally server and parses the response.
 */
async function fetchAndParseTallyData(connection) {
    const { server, port, company } = connection;
    const url = `http://${server}:${port}`;

    const companyTag = company ? `<SVCOMPANY>${company}</SVCOMPANY>` : '';

    const xmlRequest = `
    <ENVELOPE>
        <HEADER>
            <TALLYREQUEST>Export Data</TALLYREQUEST>
        </HEADER>
        <BODY>
            <EXPORTDATA>
                <REQUESTDESC>
                    <REPORTNAME>Voucher Register</REPORTNAME>
                    <STATICVARIABLES>
                        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                        <SVFROMDATE>20230401</SVFROMDATE>
                        <SVTODATE>20250331</SVTODATE>
                        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                        ${companyTag}
                    </STATICVARIABLES>
                </REQUESTDESC>
            </EXPORTDATA>
        </BODY>
    </ENVELOPE>`;

    try {
        const response = await axios.post(url, xmlRequest, {
            headers: { 'Content-Type': 'text/xml' },
            timeout: 20000,
        });
        
        if (response.data.includes('<NORSPS>')) { // Tally often returns this for "No Response"
           return [];
        }

        const parser = new xml2js.Parser({ explicitArray: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
        const parsedData = await parser.parseStringPromise(response.data);
        
        return parseVouchersToInvoices(parsedData);

    } catch (error) {
        console.error('Error connecting to or parsing from Tally:', error.message);
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Connection failed. Ensure Tally is running and listening on ${url}.`);
        }
        throw new Error('Failed to communicate with Tally server.');
    }
}

/**
 * Parses the Tally "Voucher Register" XML structure into a clean invoice array.
 */
function parseVouchersToInvoices(tallyData) {
    const invoices = [];
    const vouchers = tallyData?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE?.VOUCHER;
    
    if (!vouchers) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Tally returns a single object if there's only one voucher, and an array otherwise.
    const voucherList = Array.isArray(vouchers) ? vouchers : [vouchers];

    for (const voucher of voucherList) {
        if (!voucher || !voucher.DATE || !voucher.VOUCHERNUMBER) continue;

        const invoiceDate = new Date(voucher.DATE);
        invoiceDate.setHours(0, 0, 0, 0);

        const creditPeriodStr = voucher['BILLALLOCATIONS.LIST']?.BILLCREDITPERIOD || '0 Days';
        const creditDays = parseInt(creditPeriodStr.split(' ')[0], 10) || 0;

        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + creditDays);

        const diffDays = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));
        
        let status = 'Pending';
        let daysOverdue = 0;
        
        if (diffDays > 0) {
            status = 'Overdue';
            daysOverdue = diffDays;
        } else if (diffDays >= -7) {
            status = 'Due Soon';
        }

        const amountStr = voucher['ALLLEDGERENTRIES.LIST']?.AMOUNT || '0';
        const amount = Math.abs(parseFloat(amountStr));

        invoices.push({
            id: randomUUID(),
            customerName: voucher.BASICBUYERNAME,
            invoiceNo: voucher.VOUCHERNUMBER,
            invoiceDate: voucher.DATE,
            dueDate: dueDate.toISOString().split('T')[0],
            amount: amount,
            outstanding: amount, // Assuming full outstanding for this logic
            status: status,
            daysOverdue: daysOverdue,
            customerContact: {
                email: voucher.BUYEREMAIL || '',
                phone: voucher.BUYERPHONE || '',
                whatsapp: voucher.BUYERPHONE || '', // Defaulting to phone
            },
            lastReminderSent: null,
        });
    }
    return invoices;
}


// --- API Endpoints ---

// Tally Sync Endpoint
app.post('/api/tally/sync', async (req, res) => {
    try {
        const connection = req.body;
        const invoices = await fetchAndParseTallyData(connection);
        
        res.json({
            success: true,
            message: `Synced ${invoices.length} invoices successfully.`,
            count: invoices.length,
            data: invoices
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Settings Endpoints
app.get('/api/settings', (req, res) => res.json(appSettings));

app.post('/api/settings', (req, res) => {
  // Deep merge settings
  if (req.body.tally) appSettings.tally = { ...appSettings.tally, ...req.body.tally };
  if (req.body.email) appSettings.email = { ...appSettings.email, ...req.body.email };
  if (req.body.sms) appSettings.sms = { ...appSettings.sms, ...req.body.sms };
  if (req.body.whatsapp) appSettings.whatsapp = { ...appSettings.whatsapp, ...req.body.whatsapp };
  res.json({ success: true, message: "Settings saved." });
});

app.post('/api/tally/test', async (req, res) => {
    try {
        await axios.get(`http://${req.body.server}:${req.body.port}`, { timeout: 5000 });
        res.json({ success: true, message: 'Connection to Tally server is successful!' });
    } catch (error) {
        res.status(502).json({ success: false, message: 'Could not reach Tally server.' });
    }
});

app.get('/api/invoices', (req, res) => res.json({ data: [] })); // Not used, sync provides data

app.post('/api/reminders/send', (req, res) => {
    console.log(`Simulating reminder send for:`, req.body);
    res.json({ success: true, message: "Reminder sent (simulated)." });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`✅ TallyFlow Backend is running at http://localhost:${PORT}`);
  console.log('This server connects to Tally, parses XML, and returns JSON.');
});
