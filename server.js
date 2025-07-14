const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const app = express();

// Configurar CORS
app.use(cors({
  origin: ['https://seu-site.netlify.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Configurar parsing de JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar variáveis de ambiente
require('dotenv').config();

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configurar Multer para upload temporário
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas!'), false);
    }
  }
});

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Função para gerar um ID único
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// Endpoint para upload de imagens
app.post('/api/upload', upload.array('imagens', 3), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }
    const uploadPromises = req.files.map(file =>
      cloudinary.uploader.upload(file.path, {
        folder: 'centrodecompra'
      }).then(result => result.secure_url)
    );
    const urls = await Promise.all(uploadPromises);
    req.files.forEach(file => fs.unlinkSync(file.path)); // Deletar arquivos temporários
    res.json({ urls });
  } catch (error) {
    console.error('❌ Erro ao fazer upload de imagens:', error.message);
    res.status(500).json({ error: 'Erro ao fazer upload de imagens', details: error.message });
  }
});

// Endpoint para listar produtos
app.get('/api/produtos', (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');
    if (!fs.existsSync(produtosPath)) {
      fs.writeFileSync(produtosPath, '[]', 'utf-8');
      return res.json({ produtos: [], total: 0 });
    }
    const fileData = fs.readFileSync(produtosPath, 'utf-8');
    const produtos = JSON.parse(fileData);

    const { page = 1, limit = 25, categoria, loja } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return res.status(400).json({ error: 'Parâmetros de página ou limite inválidos' });
    }

    let filteredProdutos = produtos;
    if (categoria) {
      filteredProdutos = filteredProdutos.filter(p => p.categoria === categoria);
    }
    if (loja) {
      filteredProdutos = filteredProdutos.filter(p => p.loja === loja);
    }

    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    res.json({
      produtos: filteredProdutos.slice(start, end),
      total: filteredProdutos.length
    });
  } catch (error) {
    console.error('❌ Erro ao carregar produtos:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

// Endpoint para adicionar produto
app.post('/api/produtos', (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');
    if (!fs.existsSync(produtosPath)) {
      fs.writeFileSync(produtosPath, '[]', 'utf-8');
    }
    const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf-8'));

    const { nome, categoria, loja, link, imagens } = req.body;
    if (!nome || !categoria || !loja || !link) {
      return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    const novoProduto = {
      _id: generateId(),
      nome,
      categoria,
      loja,
      link,
      imagens: Array.isArray(imagens) ? imagens : (imagens ? [imagens] : [])
    };

    produtos.push(novoProduto);
    fs.writeFileSync(produtosPath, JSON.stringify(produtos, null, 2), 'utf-8');

    res.status(201).json({ message: 'Produto adicionado com sucesso', produto: novoProduto });
  } catch (error) {
    console.error('❌ Erro ao adicionar produto:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

// Endpoint para atualizar produto
app.put('/api/produtos/:id', (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');
    if (!fs.existsSync(produtosPath)) {
      throw new Error(`Arquivo produtos.json não encontrado em ${produtosPath}`);
    }
    const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf-8'));
    const produtoId = req.params.id;

    const index = produtos.findIndex(p => p._id === produtoId);
    if (index === -1) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const { nome, categoria, loja, link, imagens } = req.body;
    if (!nome || !categoria || !loja || !link) {
      return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    produtos[index] = {
      _id: produtoId,
      nome,
      categoria,
      loja,
      link,
      imagens: Array.isArray(imagens) ? imagens : (imagens ? [imagens] : [])
    };

    fs.writeFileSync(produtosPath, JSON.stringify(produtos, null, 2), 'utf-8');
    res.json({ message: 'Produto atualizado com sucesso', produto: produtos[index] });
  } catch (error) {
    console.error('❌ Erro ao atualizar produto:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

// Endpoint para excluir produto
app.delete('/api/produtos/:id', (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');
    if (!fs.existsSync(produtosPath)) {
      throw new Error(`Arquivo produtos.json não encontrado em ${produtosPath}`);
    }
    const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf-8'));
    const produtoId = req.params.id;

    const index = produtos.findIndex(p => p._id === produtoId);
    if (index === -1) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    produtos.splice(index, 1);
    fs.writeFileSync(produtosPath, JSON.stringify(produtos, null, 2), 'utf-8');
    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao excluir produto:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

// Endpoint para obter um produto específico
app.get('/api/produtos/:id', (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');
    if (!fs.existsSync(produtosPath)) {
      throw new Error(`Arquivo produtos.json não encontrado em ${produtosPath}`);
    }
    const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf-8'));
    const produtoId = req.params.id;

    const produto = produtos.find(p => p._id === produtoId);
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(produto);
  } catch (error) {
    console.error('❌ Erro ao obter produto:', error.message);
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
