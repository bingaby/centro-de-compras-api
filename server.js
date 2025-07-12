const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

// Configurar CORS para permitir requisições do frontend
app.use(cors());

// Configurar variáveis de ambiente (opcional)
require('dotenv').config();

// Servir arquivos estáticos da pasta /public (se existir)
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint para produtos
app.get('/api/produtos', (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');

    if (!fs.existsSync(produtosPath)) {
      throw new Error(`Arquivo produtos.json não encontrado em ${produtosPath}`);
    }

    // Usar fs.readFileSync em vez de require (evita cache e erro em produção)
    const fileData = fs.readFileSync(produtosPath, 'utf-8');
    const produtos = JSON.parse(fileData);

    const { page = 1, limit = 24 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return res.status(400).json({ error: 'Parâmetros de página ou limite inválidos' });
    }

    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    res.json({
      produtos: produtos.slice(start, end),
      total: produtos.length
    });
  } catch (error) {
    console.error('❌ Erro ao carregar produtos:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

// Rota para favicon
app.get('/favicon.ico', (req, res) => {
  const faviconPath = path.join(__dirname, 'imagens', 'favicon.ico');
  res.sendFile(faviconPath, (err) => {
    if (err) res.status(204).end();
  });
});

// Rota 404 padrão
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Iniciar servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
