const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const app = express();

app.use(cors({
  origin: ['https://www.centrodecompra.com.br', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function checkAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer temp-token-')) {
    return res.status(401).json({ error: 'Acesso não autorizado' });
  }
  next();
}

app.get('/api/produtos', async (req, res) => {
  try {
    const { page = 1, limit = 25, categoria, loja } = req.query;
    const data = await fs.readFile('produtos.json', 'utf8');
    let produtos = JSON.parse(data || '[]');
    
    if (categoria) produtos = produtos.filter(p => p.categoria === categoria);
    if (loja) produtos = produtos.filter(p => p.loja === loja);
    
    const start = (page - 1) * limit;
    const end = start + parseInt(limit);
    const paginatedProdutos = produtos.slice(start, end);
    
    res.json({ produtos: paginatedProdutos, total: produtos.length });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar produtos', details: err.message });
  }
});

// Outros endpoints (POST, PUT, DELETE) com checkAuth
app.post('/api/produtos', checkAuth, async (req, res) => { /* ... */ });
app.put('/api/produtos/:id', checkAuth, async (req, res) => { /* ... */ });
app.delete('/api/produtos/:id', checkAuth, async (req, res) => { /* ... */ });

app.listen(10000, () => console.log('🚀 Servidor rodando na porta 10000'));
