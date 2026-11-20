import { createNetworkGraph } from '/network-scene.js';

const explorer = document.querySelector('#referral-network');
const stage = explorer.querySelector('.graph-stage');
const controls = explorer.querySelector('.graph-controls');
const instructions = explorer.querySelector('#graph-instructions');
const route = explorer.querySelector('[data-route]');
const detail = explorer.querySelector('[data-detail]');
const buttons = [...explorer.querySelectorAll('[data-node]')];

const nodes = {
  meera: {
    position: [-3, 0.22, -0.02], colour: '#f5dfbd', radius: 0.43,
    route: 'Meera → Asha',
    detail: 'Meera opens an offer from someone she knows. When she opens the business’s bill in the same browser, the eligible discount is already applied.',
  },
  asha: {
    position: [-0.24, -0.41, 0.82], colour: '#f1ab8a', radius: 0.48,
    route: 'Meera → Asha → participating businesses',
    detail: 'Asha shares offers from two businesses she knows. She can earn points from either business after a qualifying paid purchase.',
  },
  mango: {
    position: [2.61, 1.2, -0.62], colour: '#ddebca', radius: 0.51,
    route: 'Meera → Asha → Mango Yard',
    detail: 'Asha’s link gives Meera 10% off a bill of ₹700 or more. Ref applies the offer when Meera opens checkout.',
  },
  field: {
    position: [2.78, -1.2, 0.21], colour: '#c4d5ac', radius: 0.44,
    route: 'Meera → Asha → Field Supply',
    detail: 'Asha’s introduction gives Meera ₹150 off a bill of ₹1,000 or more. Asha’s points are redeemable at Field Supply.',
  },
};

const nearbyNodes = [
  [[-3.87, 1.04, -1.5], 'meera'], [[-3.55, -1.64, -1.24], 'meera'],
  [[-2.28, 1.77, -1.13], 'meera'], [[-1.69, -2.1, -1.12], 'asha'],
  [[-1.09, 1.82, -1.71], 'asha'], [[0.45, 1.8, -2.28], 'asha'],
  [[0.85, -1.86, -1.83], 'asha'], [[1.81, 2.03, -2.28], 'mango'],
  [[3.2, 2.04, -1.85], 'mango'], [[3.94, 1.03, -2.35], 'mango'],
  [[3.83, -0.2, -1.78], 'field'], [[3.52, -2.15, -1.05], 'field'],
];

const graph = createNetworkGraph({ stage, controls, instructions });
const edges = [['meera', 'asha'], ['asha', 'mango'], ['asha', 'field']];
graph.setData({ nodes, edges, nearby: nearbyNodes });

function select(key) {
  explorer.dataset.selected = key;
  for (const item of buttons) item.setAttribute('aria-pressed', String(item.dataset.node === key));
  route.textContent = nodes[key].route;
  detail.textContent = nodes[key].detail;
  const branch = key === 'field' ? 'field' : 'mango';
  graph.select(key, edges.filter(([, end]) => end === 'asha' || end === branch || key === 'asha'));
}

for (const button of buttons) {
  button.addEventListener('click', () => select(button.dataset.node));
}
select(explorer.dataset.selected);
