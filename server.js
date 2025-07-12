const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

// Configurar CORS para permitir requisições do frontend
app.use(cors());

// Configurar variáveis de ambiente
require('dotenv').config();

// Servir arquivos estáticos (ex.: favicon.ico, imagens)
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint para produtos
app.get('/api/produtos', (req, res) => {
  try {
    // Carregar produtos.json da raiz do repositório
    const produtosPath = path.join(__dirname, 'produtos.json');
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(produtosPath)) {
      throw new Error(`Arquivo produtos.json não encontrado em ${produtosPath}`);
    }

    const produtos = require(produtosPath);
    const { page = 1, limit = 24 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Validação dos parâmetros
    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return res.status(400).json({ error: 'Parâmetros de página ou limite inválidos' });
    }

    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    // Retornar produtos paginados
    res.json({
      produtos: produtos.slice(start, end),
      total: produtos.length
    });
  } catch (error) {
    console.error('Erro ao carregar produtos:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

// Tratar erro 404 para favicon.ico
app.get('/favicon.ico', (req, res) => {
  const faviconPath = path.join(__dirname, 'imagens', 'favicon.ico'); // Usar pasta imagens
  res.sendFile(faviconPath, (err) => {
    if (err) {
      res.status(204).end(); // Retorna vazio se não encontrar o favicon
    }
  });
});

// Tratar rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Iniciar o servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
