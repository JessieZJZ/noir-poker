import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { webDriverRequest } from '../../scripts/native-http.mjs';

async function serve(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test('WebDriver requests wait for a slow session and send JSON bodies', async (t) => {
  let received;
  const server = await serve((request, response) => {
    let text = '';
    request.on('data', (chunk) => (text += chunk));
    request.on('end', () => {
      received = { method: request.method, body: JSON.parse(text) };
      // A delayed reply stands in for a WebDriverAgent build during session creation.
      setTimeout(() => response.end(JSON.stringify({ value: { sessionId: 'abc' } })), 300);
    });
  });
  t.after(server.close);
  const value = await webDriverRequest(`${server.url}/session`, 'POST', { capabilities: {} }, 5000);
  assert.deepEqual(value, { sessionId: 'abc' });
  assert.deepEqual(received, { method: 'POST', body: { capabilities: {} } });
});

test('WebDriver errors and inactivity reject with the endpoint', async (t) => {
  const server = await serve((request, response) => {
    if (request.url === '/silent') return;
    response.statusCode = 404;
    response.end(JSON.stringify({ value: { error: 'no such element', message: 'missing' } }));
  });
  t.after(server.close);
  await assert.rejects(webDriverRequest(`${server.url}/element`, 'GET'), /GET \/element: missing/);
  await assert.rejects(
    webDriverRequest(`${server.url}/silent`, 'GET', undefined, 200),
    /GET \/silent: no response in 200 ms/,
  );
});
