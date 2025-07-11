const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const app = express();

// Configurações
app.use(cors());
app.use(express.json());
app.use('/upload', express.static(path.join(__dirname, 'upload')));

// Configurar multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'upload/');
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const nomeProduto = req.body.nome.replace(/\s+/g, '-').toLowerCase();
    const ext = path.extname(file.originalname);
    cb(null, `produto_${nomeProduto}-${timestamp}${ext}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Máximo 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas!'));
    }
  }
});

// Criar pasta upload se não existir
fs.mkdir('upload', { recursive: true }).catch(console.error);

// Endpoint para listar produtos
app.get('/api/produtos', async (req, res) => {
  try {
    let data;
    try {
      data = await fs.readFile('produtos.json', 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.writeFile('produtos.json', '[]', 'utf8');
        data = '[]';
      } else {
        throw error;
      }
