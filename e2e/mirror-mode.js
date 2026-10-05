// Switches the local test mirror's catalog mode (host-only admin port; Maestro runs on the host).
const res = http.get('http://127.0.0.1:8444/mode/' + MODE);
if (res.status !== 200) throw new Error('mirror mode ' + MODE + ' failed: ' + res.status);
