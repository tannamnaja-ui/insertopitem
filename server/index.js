const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const dbconfigRoutes = require('./routes/dbconfig');
const drugitemsRoutes = require('./routes/drugitems');
const drugusageRoutes = require('./routes/drugusage');
const doctorsRoutes = require('./routes/doctors');
const departmentsRoutes = require('./routes/departments');
const templatesRoutes = require('./routes/templates');
const expenseRoutes = require('./routes/expense');
const visitsRoutes = require('./routes/visits');

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
app.use('/api/drugitems', drugitemsRoutes);
app.use('/api/drugusage', drugusageRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/expense', expenseRoutes);
app.use('/api/visits', visitsRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
