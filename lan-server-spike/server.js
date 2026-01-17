import express from 'express';
import cors from 'cors';
import ip from 'ip';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3030;

// Enable CORS for all routes
app.use(cors());

// Serve static files from current directory
app.use(express.static(__dirname));

// API Info endpoint
app.get('/api/info', (req, res) => {
    const localIp = ip.address();
    res.json({
        url: `http://${localIp}:${PORT}/mechanic.html`,
        ip: localIp,
        port: PORT
    });
});

// API Time endpoint
app.get('/api/time', (req, res) => {
    const now = new Date();
    const timeString = now.toISOString().replace('T', ' ').substring(0, 19);
    res.json({
        time: timeString
    });
});

// Explicit route for mechanic.html
app.get('/mechanic.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'mechanic.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    const localIp = ip.address();
    
    console.log('\n🚀 Starting LAN Server Spike (Node.js Version)...\n');
    console.log(`📍 Local IP: ${localIp}`);
    console.log('\n✅ Server is running!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📱 Desktop App: http://localhost:${PORT}/index.html`);
    console.log(`📱 Mechanic Mobile: http://${localIp}:${PORT}/mechanic.html`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔍 Testing Instructions:');
    console.log(`  1. Open http://localhost:${PORT}/index.html on this PC`);
    console.log('  2. Connect your phone to the SAME Wi-Fi network');
    console.log(`  3. Open http://${localIp}:${PORT}/mechanic.html on your phone`);
    console.log('\n⚠️  Make sure Windows Firewall allows connections on port 3030\n');
});
