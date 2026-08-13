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
const apitokenRoutes = require('./routes/apitoken');
const dfAutoJob = require('./dfAutoJob');
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

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  dfAutoJob.startScheduler();
});
