const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const dbconfigRoutes = require('./routes/dbconfig');
const drugitemsRoutes = require('./routes/drugitems');
const drugusageRoutes = require('./routes/drugusage');
const doctorsRoutes = require('./routes/doctors');
const departmentsRoutes = require('./routes/departments');
const dfitemsRoutes = require('./routes/dfitems');
const templatesRoutes = require('./routes/templates');
const expenseRoutes = require('./routes/expense');
const visitsRoutes = require('./routes/visits');
const dfautoRoutes = require('./routes/dfauto');
const opiautoRoutes = require('./routes/opiauto');
const opiautoItemsRoutes = require('./routes/opiautoitems');
const pttypeGroupsRoutes = require('./routes/pttypegroups');
const icd10Routes = require('./routes/icd10');
const icd10autoRoutes = require('./routes/icd10auto');
const icd10autoItemsRoutes = require('./routes/icd10autoitems');
const apitokenRoutes = require('./routes/apitoken');
const dfAutoJob = require('./dfAutoJob');
const opiAutoJob = require('./opiAutoJob');
const icd10AutoJob = require('./icd10AutoJob');
const requireApiToken = require('./middleware/requireApiToken');

const app = express();
const PORT = 3011;

app.use(express.json());
app.use(session({
  secret: 'insertopitem-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 },
}));

app.use('/api/auth', authRoutes);
app.use('/api/dbconfig', dbconfigRoutes);
app.use('/api/apitoken', apitokenRoutes);
app.use('/api/drugitems', requireApiToken, drugitemsRoutes);
app.use('/api/drugusage', requireApiToken, drugusageRoutes);
app.use('/api/doctors', requireApiToken, doctorsRoutes);
app.use('/api/departments', requireApiToken, departmentsRoutes);
app.use('/api/df-items', requireApiToken, dfitemsRoutes);
app.use('/api/templates', requireApiToken, templatesRoutes);
app.use('/api/expense', requireApiToken, expenseRoutes);
app.use('/api/visits', requireApiToken, visitsRoutes);
app.use('/api/dfauto', requireApiToken, dfautoRoutes);
app.use('/api/opiauto', requireApiToken, opiautoRoutes);
app.use('/api/opiauto-items', requireApiToken, opiautoItemsRoutes);
app.use('/api/pttype-groups', requireApiToken, pttypeGroupsRoutes);
app.use('/api/icd10', requireApiToken, icd10Routes);
app.use('/api/icd10auto', requireApiToken, icd10autoRoutes);
app.use('/api/icd10auto-items', requireApiToken, icd10autoItemsRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  // ทุกงานอัตโนมัติที่เปิดไว้ทำงานพร้อมกันทั้งหมด แยก timer และแยกสถานะกันคนละไฟล์
  // เหลื่อมเวลาเริ่มไว้ 30 วินาที เพื่อไม่ให้ยิงคำสั่งเข้าฐานข้อมูลชนกันพอดีทุกรอบ
  dfAutoJob.startScheduler({ offsetMs: 0 });
  opiAutoJob.startScheduler({ offsetMs: 30 * 1000 });
  icd10AutoJob.startScheduler({ offsetMs: 60 * 1000 });
});
