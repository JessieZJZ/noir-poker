import http from 'node:http';

// WebDriver JSON request. Node's fetch stops waiting for response headers
// after 300 s, but creating a CI session can build WebDriverAgent for longer.
// Only the caller's timeout, measured as socket inactivity, bounds the wait.
export function webDriverRequest(url, method, body, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request(
      url,
      {
        method,
        headers: {
          'content-type': 'application/json',
          ...(data === undefined ? {} : { 'content-length': Buffer.byteLength(data) }),
        },
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => {
          try {
            const payload = JSON.parse(text);
            if (response.statusCode >= 400 || payload.value?.error)
              throw Error(
                `${method} ${new URL(url).pathname}: ${payload.value?.message || response.statusMessage}`,
              );
            resolve(payload.value);
          } catch (error) {
            reject(error);
          }
        });
        response.on('error', reject);
      },
    );
    request.setTimeout(timeout, () =>
      request.destroy(Error(`${method} ${new URL(url).pathname}: no response in ${timeout} ms`)),
    );
    request.on('error', reject);
    if (data !== undefined) request.write(data);
    request.end();
  });
}
