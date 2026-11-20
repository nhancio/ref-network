// Illustrative Bengaluru network used on the landing page and optional empty-state preview

export const SAMPLE_USER = {
  name: 'Nithin',
  headline: 'Founder · Nhancio',
  photoUrl: '',
};

export const SAMPLE_CONTACTS = [
  { id: 's1', name: 'Ananya Rao', company: 'Mango Yard', companyKey: 'mango yard', role: 'Founder & Host', email: 'ananya@mangoyard.in', phone: '+91 98450 11201', linkedinUrl: 'https://linkedin.com/in/ananya-rao', sources: ['linkedin', 'google'], canIntroduce: true, notes: 'Knows the Indiranagar dining circle well.' },
  { id: 's2', name: 'Rohan Deshmukh', company: 'Swiggy', companyKey: 'swiggy', role: 'VP Product', email: 'rohan.d@example.com', phone: '+91 98450 22109', linkedinUrl: 'https://linkedin.com/in/rohan-deshmukh', sources: ['linkedin'], canIntroduce: true, notes: 'College batchmate.' },
  { id: 's3', name: 'Kavya Nair', company: 'Swiggy', companyKey: 'swiggy', role: 'Design Lead', email: 'kavya.n@example.com', phone: '', linkedinUrl: 'https://linkedin.com/in/kavya-nair', sources: ['linkedin'], canIntroduce: false, notes: '' },
  { id: 's4', name: 'Siddharth Menon', company: 'Swiggy', companyKey: 'swiggy', role: 'Staff Engineer', email: 'sid@example.com', phone: '+91 99001 44520', linkedinUrl: 'https://linkedin.com/in/sid-menon', sources: ['linkedin', 'google'], canIntroduce: false, notes: '' },
  { id: 's5', name: 'Meera Krishnan', company: 'Razorpay', companyKey: 'razorpay', role: 'Head of Partnerships', email: 'meera.k@example.com', phone: '+91 98860 33112', linkedinUrl: 'https://linkedin.com/in/meera-krishnan', sources: ['linkedin', 'google'], canIntroduce: true, notes: 'Great connector for fintech founders.' },
  { id: 's6', name: 'Arjun Subramanian', company: 'Razorpay', companyKey: 'razorpay', role: 'Product Manager', email: '', phone: '+91 98802 19283', linkedinUrl: 'https://linkedin.com/in/arjun-sub', sources: ['linkedin'], canIntroduce: false, notes: '' },
  { id: 's7', name: 'Priya Venkatesh', company: 'Zerodha', companyKey: 'zerodha', role: 'Engineering Manager', email: 'priya.v@example.com', phone: '', linkedinUrl: 'https://linkedin.com/in/priya-v', sources: ['linkedin'], canIntroduce: true, notes: '' },
  { id: 's8', name: 'Devika Joshi', company: 'Third Wave Coffee', companyKey: 'third wave coffee', role: 'Brand Director', email: 'devika@example.com', phone: '+91 97412 88321', linkedinUrl: 'https://linkedin.com/in/devika-joshi', sources: ['google'], canIntroduce: true, notes: 'Met at Indiranagar founders coffee.' },
  { id: 's9', name: 'Vikramaditya Shetty', company: 'Peak XV Partners', companyKey: 'peak xv partners', role: 'Principal', email: 'vikram@example.com', phone: '+91 98451 99812', linkedinUrl: 'https://linkedin.com/in/vikram-shetty', sources: ['linkedin', 'google'], canIntroduce: true, notes: '' },
  { id: 's10', name: 'Neha Kulkarni', company: 'CRED', companyKey: 'cred', role: 'Design Systems Lead', email: 'neha.k@example.com', phone: '', linkedinUrl: 'https://linkedin.com/in/neha-kulkarni', sources: ['linkedin'], canIntroduce: false, notes: '' },
  { id: 's11', name: 'Aditya Verma', company: 'CRED', companyKey: 'cred', role: 'Growth Lead', email: 'aditya.v@example.com', phone: '+91 99801 77621', linkedinUrl: 'https://linkedin.com/in/aditya-verma', sources: ['google'], canIntroduce: false, notes: '' },
  { id: 's12', name: 'Asha Murthy', company: 'Field Supply', companyKey: 'field supply', role: 'Owner · Home & Pantry', email: 'asha@fieldsupply.in', phone: '+91 98455 61209', linkedinUrl: '', sources: ['google'], canIntroduce: true, notes: 'Independent ceramic & pantry shop on 12th Main.' },
  { id: 's13', name: 'Karthik Raj', company: 'Stripe', companyKey: 'stripe', role: 'Solutions Architect', email: 'karthik.r@example.com', phone: '', linkedinUrl: 'https://linkedin.com/in/karthik-raj', sources: ['linkedin'], canIntroduce: false, notes: '' },
  { id: 's14', name: 'Tanvi Sharma', company: 'Google', companyKey: 'google', role: 'Staff UX Researcher', email: 'tanvi.s@example.com', phone: '+91 98452 33910', linkedinUrl: 'https://linkedin.com/in/tanvi-sharma', sources: ['linkedin', 'google'], canIntroduce: true, notes: '' },
  { id: 's15', name: 'Pranav Iyer', company: 'Google', companyKey: 'google', role: 'Senior Software Engineer', email: '', phone: '', linkedinUrl: 'https://linkedin.com/in/pranav-iyer', sources: ['linkedin'], canIntroduce: false, notes: '' },
  { id: 's16', name: 'Shreya Banerjee', company: 'Mango Yard', companyKey: 'mango yard', role: 'Operations Lead', email: 'shreya@mangoyard.in', phone: '+91 98459 55102', linkedinUrl: '', sources: ['google'], canIntroduce: false, notes: '' },
];

export const SAMPLE_CIRCLE = [
  {
    uid: 'circle-asha',
    name: 'Asha Murthy',
    headline: 'Founder · Field Supply',
    status: 'connected',
    sharedCompanies: [
      { companyKey: 'araku coffee', company: 'Araku Coffee', count: 4, introCount: 2 },
      { companyKey: 'naru noodle bar', company: 'Naru Noodle Bar', count: 2, introCount: 1 },
    ],
  },
  {
    uid: 'circle-rohan',
    name: 'Rohan Deshmukh',
    headline: 'VP Product · Swiggy',
    status: 'connected',
    sharedCompanies: [
      { companyKey: 'zomato', company: 'Zomato', count: 6, introCount: 2 },
      { companyKey: 'zepto', company: 'Zepto', count: 5, introCount: 1 },
    ],
  },
];
