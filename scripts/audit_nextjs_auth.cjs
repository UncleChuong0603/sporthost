// Offline feasibility probe only. Not an application authentication implementation.
// Synthetic fixtures arrive over stdin; no environment, database or production key access.
const { createHash, createHmac, pbkdf2Sync, timingSafeEqual } = require('node:crypto');
const { inflateSync } = require('node:zlib');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const fixture = JSON.parse(input);
  const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
  function unpack(token, salt, now, maxAge) {
    const parts = token.split('.');
    if (parts.length < 3) throw Error('malformed');
    const signature = Buffer.from(parts.pop(), 'base64url');
    const time = parts.pop();
    const payload = parts.join('.');
    const key = createHash('sha1').update(salt + 'signer' + fixture.secret).digest();
    const expected = createHmac('sha1', key).update(payload + '.' + time).digest();
    if (!equal(signature, expected)) throw Error('signature');
    const timestamp = Number.parseInt(Buffer.from(time, 'base64url').toString('hex'), 16);
    if (!Number.isSafeInteger(timestamp) || now - timestamp < 0 || now - timestamp > maxAge) throw Error('expiry');
    const compressed = payload.startsWith('.');
    let raw = Buffer.from(compressed ? payload.slice(1) : payload, 'base64url');
    if (compressed) raw = inflateSync(raw, { maxOutputLength: 16384 });
    return JSON.parse(raw.toString('utf8'));
  }
  let passwords = 0, signedPayloads = 0, rejected = 0;
  for (const row of fixture.passwords) {
    const [salt, hash] = row.hash.split(':');
    const expected = Buffer.from(hash, 'hex');
    const actual = pbkdf2Sync(row.password, Buffer.from(salt, 'hex'), 310000, 32, 'sha256');
    if (!equal(actual, expected)) throw Error('password incompatibility');
    const wrong = pbkdf2Sync(row.password + 'wrong', Buffer.from(salt, 'hex'), 310000, 32, 'sha256');
    if (equal(wrong, expected)) throw Error('wrong password accepted');
    passwords++;
  }
  const now = Math.floor(Date.now() / 1000);
  for (const row of fixture.tokens) {
    if (JSON.stringify(unpack(row.token, row.salt, now, row.maxAge)) !== JSON.stringify(row.payload)) throw Error('payload incompatibility');
    signedPayloads++;
    for (const invalid of [
      () => unpack(row.token, row.salt + 'wrong', now, row.maxAge),
      () => unpack(row.token.slice(0, -3) + 'AAA', row.salt, now, row.maxAge),
      () => unpack(row.token, row.salt, now + row.maxAge + 2, row.maxAge),
      () => unpack(row.token, row.salt, now - row.maxAge, row.maxAge),
    ]) {
      let failed = false;
      try { invalid(); } catch { failed = true; }
      if (!failed) throw Error('invalid token accepted');
      rejected++;
    }
  }
  const guest = createHmac('sha256', fixture.secret).update('guest-booking-v2|' + fixture.nonce).digest('hex');
  if (guest !== fixture.guestToken || createHash('sha256').update(guest).digest('hex') !== fixture.guestDigest) throw Error('guest capability incompatibility');
  process.stdout.write(JSON.stringify({ passwords, signedPayloads, invalidTokensRejected: rejected, guestCapability: true,
    note: 'Synthetic offline feasibility only; production implementation still needs hardened parsers, limits and tests.' }));
});
