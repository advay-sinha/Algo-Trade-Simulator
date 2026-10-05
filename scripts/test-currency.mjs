import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {formatSimulationMoney,formatMoney,formatPrice} = await server.ssrLoadModule('/src/lib/format.ts');
  assert.equal(formatSimulationMoney(100000), '₹1,00,000');
  assert.equal(formatSimulationMoney(25000), '₹25,000');
  assert.equal(formatSimulationMoney(0), '₹0');
  for(const value of [null,undefined,NaN,Infinity]) assert.equal(formatSimulationMoney(value), '—');
  assert.match(formatMoney(100,'USD'), /\$100|100.*USD/);
  assert.match(formatPrice(100,'USD'), /USD$/);
  assert.match(formatPrice(100,'INR'), /INR$/);
  console.log('PASS: INR paper capital, Indian digit grouping, unavailable values, native quote currencies.');
} finally { await server.close(); }
