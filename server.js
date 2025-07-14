const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const app = express();

// Configurar CORS para permitir requisições do frontend
app.use(cors({
  origin: ['https://www.centrodecompra.com.br', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Configurar parsing de JSON e formulários
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar Multer para upload de imagens (salva temporariamente em Uploads)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'Uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.chmodSync(uploadDir, '755');
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9.-]/g, '')
      .toLowerCase();
    const finalName = `produto_${cleanName}${path.extname(file.originalname)}`;
    console.log(`Gerando nome de arquivo: ${finalName}`);
    cb(null, finalName);
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
  },
  limits: { fileSize: 2 * 1024 * 1024 } // Máximo 2MB por imagem
});

// Servir arquivos estáticos (imagens) da pasta Uploads
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads'), {
  setHeaders: (res, filePath) => {
    console.log(`Servindo arquivo: ${filePath}`);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
}));

// Função para gerar ID único
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// Função para validar URL
function isValidUrl(string) {
  try {
    new URL(string);
    return string.match(/^https?:\/\/.+/);
  } catch (_) {
    return false;
  }
}

// Middleware para verificar autenticação
function checkAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer temp-token-')) {
    console.error('Autenticação falhou: Token inválido ou ausente', { authHeader });
    return res.status(401).json({ error: 'Acesso não autorizado' });
  }
  next();
}

// Middleware para logging de erros
function logError(error, req) {
  console.error(`❌ Erro [${req.method} ${req.url}]:`, {
    message: error.message,
    stack: error.stack,
    body: req.body,
    query: req.query,
    timestamp: new Date().toISOString()
  });
}

// Endpoint para upload de imagens
app.post('/api/upload', checkAuth, upload.array('imagens', 3), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }
    const urls = req.files.map(file => `/Uploads/${file.filename}`);
    console.log('Imagens enviadas para Uploads (mover manualmente para GitHub):', urls);
    res.json({ urls, message: 'Imagens salvas em /Uploads. Faça upload manual para o GitHub (pasta imagens) e atualize o produtos.json com os URLs do GitHub.' });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Erro ao fazer upload de imagens', details: error.message });
  }
});

// Endpoint para listar produtos
app.get('/api/produtos', (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');
    if (!fs.existsSync(produtosPath)) {
      fs.writeFileSync(produtosPath, '[]', 'utf-8');
      console.log('Arquivo produtos.json criado');
      return res.json({ produtos: [], total: 0 });
    }
    const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf-8'));

    const { page = 1, limit = 8, categoria, loja } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      console.error('Parâmetros de página ou limite inválidos:', { page, limit });
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

    console.log(`Listando produtos: página ${pageNum}, limite ${limitNum}, total ${filteredProdutos.length}`);
    res.json({
      produtos: filteredProdutos.slice(start, end),
      total: filteredProdutos.length
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

// Endpoint para adicionar produto
app.post('/api/produtos', checkAuth, upload.array('imagens', 3), (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');
    if (!fs.existsSync(produtosPath)) {
      fs.writeFileSync(produtosPath, '[]', 'utf-8');
      console.log('Arquivo produtos.json criado');
    }
    const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf-8'));

    const { nome, descricao, categoria, loja, link, preco } = req.body;
    if (!nome || !descricao || !categoria || !loja || !link || !preco) {
      console.error('Campos obrigatórios ausentes:', { nome, descricao, categoria, loja, link, preco });
      return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    if (!isValidUrl(link)) {
      console.error('Link inválido:', link);
      return res.status(400).json({ error: 'Link inválido! Deve começar com http:// ou https://' });
    }

    const precoNum = parseFloat(preco);
    if (isNaN(precoNum) || precoNum <= 0) {
      console.error('Preço inválido:', preco);
      return res.status(400).json({ error: 'O preço deve ser um número maior que zero' });
    }

    const imagens = req.files.map(file => `/Uploads/${file.filename}`);
    const produto = {
      _id: generateId(),
      nome,
      descricao,
      categoria,
      loja,
      link,
      preco: precoNum,
      imagens,
      createdAt: new Date().toISOString()
    };

    produtos.push(produto);
    fs.writeFileSync(produtosPath, JSON.stringify(produtos, null, 2), 'utf-8');
    console.log('Produto adicionado:', produto);
    console.log('Aviso: Imagens salvas em /Uploads. Faça upload manual para o GitHub (pasta imagens) e atualize o produtos.json com os URLs do GitHub.');

    res.status(201).json({ produto, message: 'Produto adicionado. Faça upload das imagens para o GitHub (pasta imagens) e atualize o produtos.json com os URLs do GitHub.' });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Erro ao adicionar produto', details: error.message });
  }
});

// Endpoint para atualizar produto
app.put('/api/produtos/:id', checkAuth, upload.array('imagens', 3), (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');
    if (!fs.existsSync(produtosPath)) {
      return res.status(404).json({ error: 'Nenhum produto cadastrado' });
    }
    const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf-8'));

    const { id } = req.params;
    const produtoIndex = produtos.findIndex(p => p._id === id);
    if (produtoIndex === -1) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const { nome, descricao, categoria, loja, link, preco } = req.body;
    if (!nome || !descricao || !categoria || !loja || !link || !preco) {
      console.error('Campos obrigatórios ausentes:', { nome, descricao, categoria, loja, link, preco });
      return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    if (!isValidUrl(link)) {
      console.error('Link inválido:', link);
      return res.status(400).json({ error: 'Link inválido! Deve começar com http:// ou https://' });
    }

    const precoNum = parseFloat(preco);
    if (isNaN(precoNum) || precoNum <= 0) {
      console.error('Preço inválido:', preco);
      return res.status(400).json({ error: 'O preço deve ser um número maior que zero' });
    }

    // Remover imagens antigas, se novas forem enviadas
    if (req.files.length > 0) {
      const imagensAntigas = produtos[produtoIndex].imagens || [];
      imagensAntigas.forEach(img => {
        if (img.startsWith('/Uploads/')) {
          const imgPath = path.join(__dirname, img.replace('/Uploads/', 'Uploads/'));
          if (fs.existsSync(imgPath)) {
            fs.unlinkSync(imgPath);
            console.log('Imagem antiga removida:', imgPath);
          }
        }
      });
    }

    const imagens = req.files.length > 0
      ? req.files.map(file => `/Uploads/${file.filename}`)
      : produtos[produtoIndex].imagens;

    const updatedProduto = {
      ...produtos[produtoIndex],
      nome,
      descricao,
      categoria,
      loja,
      link,
      preco: precoNum,
      imagens,
      updatedAt: new Date().toISOString()
    };

    produtos[produtoIndex] = updatedProduto;
    fs.writeFileSync(produtosPath, JSON.stringify(produtos, null, 2), 'utf-8');
    console.log('Produto atualizado:', updatedProduto);
    console.log('Aviso: Imagens salvas em /Uploads. Faça upload manual para o GitHub (pasta imagens) e atualize o produtos.json com os URLs do GitHub.');

    res.json({ produto: updatedProduto, message: 'Produto atualizado. Faça upload das imagens para o GitHub (pasta imagens) e atualize o produtos.json com os URLs do GitHub.' });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Erro ao atualizar produto', details: error.message });
  }
});

// Endpoint para excluir produto
app.delete('/api/produtos/:id', checkAuth, (req, res) => {
  try {
    const produtosPath = path.join(__dirname, 'produtos.json');
    if (!fs.existsSync(produtosPath)) {
      return res.status(404).json({ error: 'Nenhum produto cadastrado' });
    }
    const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf-8'));

    const { id } = req.params;
    const produtoIndex = produtos.findIndex(p => p._id === id);
    if (produtoIndex === -1) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Remover imagens associadas (apenas da pasta Uploads)
    const imagens = produtos[produtoIndex].imagens || [];
    imagens.forEach(img => {
      if (img.startsWith('/Uploads/')) {
        const imgPath = path.join(__dirname, img.replace('/Uploads/', 'Uploads/'));
        if (fs.existsSync(imgPath)) {
          fs.unlinkSync(imgPath);
          console.log('Imagem removida:', imgPath);
        }
      }
    });

    const deletedProduto = produtos.splice(produtoIndex, 1)[0];
    fs.writeFileSync(produtosPath, JSON.stringify(produtos, null, 2), 'utf-8');
    console.log('Produto excluído:', deletedProduto);

    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Erro ao excluir produto', details: error.message });
  }
});

// Middleware para tratamento de erros gerais
app.use((err, req, res, next) => {
  logError(err, req);
  if (err.message === 'Apenas imagens são permitidas!') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Imagem excede o limite de 2MB' });
  }
  res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
});

// Iniciar o servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Diretório de uploads: ${path.join(__dirname, 'Uploads')}`);
  console.log(`Diretório de produtos: ${path.join(__dirname, 'produtos.json')}`);
  console.log('Aviso: Imagens são salvas em /Uploads. Faça upload manual para o GitHub (pasta imagens) e atualize o produtos.json com os URLs do GitHub.');
});

// Manipulador de erros não capturados
process.on('uncaughtException', (err) => {
  console.error('❌ Erro não capturado:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
});
