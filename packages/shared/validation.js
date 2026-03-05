const yup = require('yup');

// Yup Schema Validation for Record Submit
const recordSchema = yup.object().shape({
  credit_score: yup.number().integer().min(300).max(850).required(),
  credit_score_source: yup.number().integer().min(0).max(4).required(),
  result: yup.boolean().required(),
  listed_income: yup.number().integer().min(0).max(1000000).required(),
  length_credit: yup.number().integer().min(0).max(100),
  starting_credit_limit: yup.number().integer().min(0).max(1000000),
  reason_denied: yup.string().max(254),
  date_applied: yup.date().required(),
  bank_customer: yup.boolean().required(),
  inquiries_3: yup.number().integer().min(0).max(50),
  inquiries_12: yup.number().integer().min(0).max(50),
  inquiries_24: yup.number().integer().min(0).max(50),
});

// Common CORS response headers
const responseHeaders = {
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT',
  'X-Requested-With': '*',
};

module.exports = {
  recordSchema,
  responseHeaders,
};
