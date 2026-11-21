// Illustrative Bengaluru network matching the core Nithin <-> Uma <-> Swiggy / Myntra warm-intro flows

export const SAMPLE_USER = {
  name: 'Nithin',
  headline: 'Founder · Nhancio',
  photoUrl: '',
};

export const SAMPLE_CONTACTS = [
  { id: 's1', name: 'Priya Nair', company: 'Myntra', companyKey: 'myntra', role: 'Growth Lead', email: 'priya.n@myntra.com', phone: '+91 98450 11201', linkedinUrl: '', sources: ['google'], canIntroduce: true, notes: 'Can introduce to Myntra brand & growth teams.' },
  { id: 's2', name: 'Karthik Reddy', company: 'Myntra', companyKey: 'myntra', role: 'Product Manager', email: 'karthik.r@myntra.com', phone: '+91 98450 22109', linkedinUrl: '', sources: ['google', 'linkedin'], canIntroduce: true, notes: 'Worked together in Bengaluru.' },
  { id: 's3', name: 'Meera Krishnan', company: 'Razorpay', companyKey: 'razorpay', role: 'Head of Partnerships', email: 'meera.k@razorpay.com', phone: '+91 98860 33112', linkedinUrl: 'https://linkedin.com/in/meera-krishnan', sources: ['google', 'linkedin'], canIntroduce: true, notes: 'Great connector for fintech founders.' },
  { id: 's4', name: 'Arjun Subramanian', company: 'Razorpay', companyKey: 'razorpay', role: 'Staff Engineer', email: 'arjun@razorpay.com', phone: '+91 98802 19283', linkedinUrl: '', sources: ['google'], canIntroduce: false, notes: '' },
  { id: 's5', name: 'Ananya Rao', company: 'Mango Yard', companyKey: 'mango yard', role: 'Founder & Host', email: 'ananya@mangoyard.in', phone: '+91 98455 61209', linkedinUrl: '', sources: ['google'], canIntroduce: true, notes: 'Indiranagar restaurant & community space.' },
  { id: 's6', name: 'Vikramaditya Shetty', company: 'Peak XV Partners', companyKey: 'peak xv partners', role: 'Principal', email: 'vikram@peakxv.com', phone: '+91 98451 99812', linkedinUrl: 'https://linkedin.com/in/vikram-shetty', sources: ['google', 'linkedin'], canIntroduce: true, notes: '' },
  { id: 's7', name: 'Neha Kulkarni', company: 'CRED', companyKey: 'cred', role: 'Design Lead', email: 'neha@cred.club', phone: '', linkedinUrl: '', sources: ['google'], canIntroduce: false, notes: '' },
  { id: 's8', name: 'Aditya Verma', company: 'CRED', companyKey: 'cred', role: 'Engineering Manager', email: 'aditya@cred.club', phone: '+91 99801 77621', linkedinUrl: '', sources: ['google'], canIntroduce: true, notes: '' },
  { id: 's9', name: 'Tanvi Sharma', company: 'Zerodha', companyKey: 'zerodha', role: 'UX Researcher', email: 'tanvi@zerodha.com', phone: '+91 98452 33910', linkedinUrl: '', sources: ['google'], canIntroduce: true, notes: '' },
  { id: 's10', name: 'Devika Joshi', company: 'Third Wave Coffee', companyKey: 'third wave coffee', role: 'Brand Director', email: 'devika@thirdwavecoffee.in', phone: '+91 97412 88321', linkedinUrl: '', sources: ['google'], canIntroduce: true, notes: '' },
];

export const SAMPLE_CIRCLE = [
  {
    uid: 'circle-uma',
    name: 'Uma',
    headline: 'Product & Community · Bengaluru',
    status: 'connected',
    sharedCompanies: [
      { companyKey: 'swiggy', company: 'Swiggy', count: 3, introCount: 2, roles: ['VP Product', 'Design Lead'] },
      { companyKey: 'zomato', company: 'Zomato', count: 2, introCount: 1, roles: ['Partnerships Lead'] },
    ],
  },
  {
    uid: 'circle-asha',
    name: 'Asha Murthy',
    headline: 'Founder · Field Supply',
    status: 'connected',
    sharedCompanies: [
      { companyKey: 'araku coffee', company: 'Araku Coffee', count: 2, introCount: 1, roles: ['Head of Retail'] },
      { companyKey: 'zepto', company: 'Zepto', count: 3, introCount: 1, roles: ['Category Lead', 'Operations'] },
    ],
  },
];
