const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// PostgreSQL Pool setup
let pool;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required by Railway usually
    });

    pool.query(`
        CREATE TABLE IF NOT EXISTS wishes (
            id VARCHAR(50) PRIMARY KEY,
            text VARCHAR(255) NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE wishes ADD COLUMN IF NOT EXISTS image TEXT;
    `).then(() => {
        console.log("PostgreSQL database connected and schema is ready!");
    }).catch(err => console.error("Database schema init error:", err));
} else {
    console.log("No DATABASE_URL found. Falling back to temporary in-memory database.");
}

// S3 Setup
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'fathersday-wishes';

// Generate presigned URL for direct S3 upload
app.get('/generate-presigned-url', async (req, res) => {
    try {
        const fileName = req.query.fileName;
        const fileType = req.query.fileType;
        if (!fileName || !fileType) return res.status(400).send('Missing fileName or fileType');

        const uniqueFileName = `${Date.now()}-${fileName}`;
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: uniqueFileName,
            ContentType: fileType,
        });

        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
        const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${uniqueFileName}`;
        
        res.json({ presignedUrl, publicUrl });
    } catch (err) {
        console.error('Error generating presigned URL:', err);
        res.status(500).json({ error: 'Failed to generate presigned URL' });
    }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory array fallback
let memoryWishes = [];

io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    try {
        // Send existing wishes to the newly connected user
        if (pool) {
            const result = await pool.query('SELECT * FROM wishes ORDER BY timestamp ASC');
            socket.emit('load_wishes', result.rows);
        } else {
            socket.emit('load_wishes', memoryWishes);
        }
    } catch (err) {
        console.error("Error loading wishes on connect", err);
    }

    // Handle incoming new wishes
    socket.on('new_wish', async (wishData) => {
        const id = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
        const isString = typeof wishData === 'string';
        const wish = {
            id,
            text: isString ? wishData : wishData.text,
            image: isString ? null : (wishData.image || null),
            timestamp: new Date()
        };
        
        if (pool) {
            try {
                await pool.query('INSERT INTO wishes (id, text, image, timestamp) VALUES ($1, $2, $3, $4)', [wish.id, wish.text, wish.image, wish.timestamp]);
                io.emit('receive_wish', wish);
            } catch (err) {
                console.error("Could not insert wish", err);
            }
        } else {
            memoryWishes.push(wish);
            io.emit('receive_wish', wish);
        }
    });

    // Handle wish deletion (Admin capability)
    socket.on('delete_wish', async (wishId) => {
        if (pool) {
            try {
                await pool.query('DELETE FROM wishes WHERE id = $1', [wishId]);
                io.emit('wish_deleted', wishId);
            } catch (err) {
                console.error("Could not delete wish", err);
            }
        } else {
            memoryWishes = memoryWishes.filter(w => w.id !== wishId);
            io.emit('wish_deleted', wishId);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
