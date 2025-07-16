const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const app = express();

app.use(cors({
  origin: ['https://www.centrodecompra.com.br', 'https://centrodecompra.com.br', 'http://localhost:3000', 'http://localhost:5500'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dataDir = path.join(__dirname, 'data');
const produtosPath = path.join(dataDir, 'produtos.json');
const uploadDir = path.join(dataDir, 'Uploads');

// Criar diretório de dados e inicializar produtos.json no início
async function initializeDataDir() {
  try {
    await fs.access(dataDir).catch(async () => {
      console.log('Criando diretório de dados:', dataDir);
      await fs.mkdir(dataDir, { recursive: true });
      await fs.chmod(dataDir, '755');
    });
    await fs.access(produtosPath).catch(async () => {
      console.log('Criando produtos.json');
      await fs.writeFile(produtosPath, '[]', 'utf-8');
    });
    await fs.access(uploadDir).catch(async () => {
      console.log('Criando diretório de uploads:', uploadDir);
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.chmod(uploadDir, '755');
    });
    console.log('Diretório de dados inicializado com sucesso');
  } catch (error) {
    console.error('Erro ao inicializar diretório de dados:', error.message);
  }
}

// Inicializar diretório antes de iniciar o servidor
initializeDataDir().then(() => {
  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        await fs.access(uploadDir);
        cb(null, uploadDir);
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const cleanName = file.originalname
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9.-]/g, '')
        .toLowerCase();
      const finalName = `produto_${Date.now()}_${cleanName}${path.extname(file.originalname)}`;
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
    limits: { fileSize: 2 * 1024 * 1024 }
  });

  app.use('/Uploads', express.static(uploadDir, {
    setHeaders: (res, filePath) => {
      console.log(`Servindo arquivo: ${filePath}`);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }));

  function generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  function isValidUrl(string) {
    try {
      new URL(string);
      return string.match(/^https?:\/\/.+/);
    } catch (_) {
      return false;
    }
  }

  function logError(error, req) {
    console.error(`❌ Erro [${req.method} ${req.url}]:`, {
      message: error.message,
      stack: error.stack,
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    });
  }

  app.get('/api/debug/produtos', async (req, res) => {
    try {
      const content = await fs.readFile(produtosPath, 'utf-8');
      res.json({ content });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao ler produtos.json', details: error.message });
    }
  });

  app.post('/api/upload', upload.array('imagens', 3), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Nenhuma imagem enviada' });
      }
      const urls = req.files.map(file => `${API_URL}/Uploads/${file.filename}`);
      console.log('Imagens enviadas:', urls);
      res.json({ urls, message: 'Imagens enviadas com sucesso' });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Erro ao fazer upload de imagens', details: error.message });
    }
  });

  app.get('/api/produtos', async (req, res) => {
    try {
      let produtos = [];
      try {
        console.log('Verificando existência de produtos.json:', produtosPath);
        const fileContent = await fs.readFile(produtosPath, 'utf-8');
        console.log('Conteúdo bruto de produtos.json:', fileContent);
        produtos = JSON.parse(fileContent);
        console.log('Produtos lidos:', produtos.length);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('produtos.json não encontrado, criando novo');
          await fs.writeFile(produtosPath, '[]', 'utf-8');
        } else {
          throw error;
        }
      }

      const { page = 1, limit = 25, categoria, loja } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
        console.error('Parâmetros de página ou limite inválidos:', { page, limit });
        return res.status(400).json({ error: 'Parâmetros de página ou limite inválidos' });
      }

      if (categoria && !['eletronicos', 'moda', 'fitness', 'casa', 'beleza', 'esportes', 'livros', 'infantil', 'celulares', 'eletrodomesticos', 'pet', 'jardinagem', 'automotivo', 'gastronomia', 'games'].includes(categoria.toLowerCase())) {
        return res.status(400).json({ error: 'Categoria inválida' });
      }
      if (loja && !['amazon', 'magalu', 'shein', 'shopee', 'mercadolivre', 'alibaba'].includes(loja.toLowerCase())) {
        return res.status(400).json({ error: 'Loja inválida' });
      }

      let filteredProdutos = produtos;
      if (categoria) {
        filteredProdutos = filteredProdutos.filter(p => p.categoria && p.categoria.toLowerCase() === categoria.toLowerCase());
      }
      if (loja) {
        filteredProdutos = filteredProdutos.filter(p => p.loja && p.loja.toLowerCase() === loja.toLowerCase());
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

  app.get('/api/produtos/:id', async (req, res) => {
    try {
      let produtos = [];
      try {
        await fs.access(produtosPath);
        produtos = JSON.parse(await fs.readFile(produtosPath, 'utf-8'));
      } catch (error) {
        return res.status(404).json({ error: 'Nenhum produto cadastrado' });
      }

      const { id } = req.params;
      const produto = produtos.find(p => p._id === id);
      if (!produto) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      console.log('Produto encontrado:', produto);
      res.json(produto);
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Erro ao buscar produto', details: error.message });
    }
  });

  app.post('/api/produtos', upload.array('imagens', 3), async (req, res) => {
    try {
      let produtos = [];
      try {
        await fs.access(produtosPath);
        produtos = JSON.parse(await fs.readFile(produtosPath, 'utf-8'));
      } catch (error) {
        await fs.writeFile(produtosPath, '[]', 'utf-8');
        console.log('Arquivo produtos.json criado');
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

      const imagens = req.files.map(file => `${API_URL}/Uploads/${file.filename}`);
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
      await fs.writeFile(produtosPath, JSON.stringify(produtos, null, 2), 'utf-8');
      console.log('Produto adicionado:', produto);

      res.status(201).json({ produto, message: 'Produto adicionado com sucesso' });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Erro ao adicionar produto', details: error.message });
    }
  });

  app.put('/api/produtos/:id', upload.array('imagens', 3), async (req, res) => {
    try {
      let produtos = [];
      try {
        await fs.access(produtosPath);
        produtos = JSON.parse(await fs.readFile(produtosPath, 'utf-8'));
      } catch (error) {
        return res.status(404).json({ error: 'Nenhum produto cadastrado' });
      }

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

      if (req.files.length > 0) {
        const imagensAntigas = produtos[produtoIndex].imagens || [];
        for (const img of imagensAntigas) {
          if (img.includes('/Uploads/')) {
            const imgPath = path.join(__dirname, 'data', img.replace(`${API_URL}/Uploads/`, 'Uploads/'));
            try {
              await fs.access(imgPath);
              await fs.unlink(imgPath);
              console.log('Imagem antiga removida:', imgPath);
            } catch (error) {
              console.log('Imagem antiga não encontrada, ignorando:', imgPath);
            }
          }
        }
      }

      const imagens = req.files.length > 0
        ? req.files.map(file => `${API_URL}/Uploads/${file.filename}`)
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
      await fs.writeFile(produtosPath, JSON.stringify(produtos, null, 2), 'utf-8');
      console.log('Produto atualizado:', updatedProduto);

      res.json({ produto: updatedProduto, message: 'Produto atualizado com sucesso' });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Erro ao atualizar produto', details: error.message });
    }
  });

  app.delete('/api/produtos/:id', async (req, res) => {
    try {
      let produtos = [];
      try {
        await fs.access(produtosPath);
        produtos = JSON.parse(await fs.readFile(produtosPath, 'utf-8'));
      } catch (error) {
        return res.status(404).json({ error: 'Nenhum produto cadastrado' });
      }

      const { id } = req.params;
      const produtoIndex = produtos.findIndex(p => p._id === id);
      if (produtoIndex === -1) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      const imagens = produtos[produtoIndex].imagens || [];
      for (const img of imagens) {
        if (img.includes('/Uploads/')) {
          const imgPath = path.join(__dirname, 'data', img.replace(`${API_URL}/Uploads/`, 'Uploads/'));
          try {
            await fs.access(imgPath);
            await fs.unlink(imgPath);
            console.log('Imagem removida:', imgPath);
          } catch (error) {
            console.log('Imagem não encontrada, ignorando:', imgPath);
          }
        }
      }

      const deletedProduto = produtos.splice(produtoIndex, 1)[0];
      await fs.writeFile(produtosPath, JSON.stringify(produtos, null, 2), 'utf-8');
      console.log('Produto excluído:', deletedProduto);

      res.json({ message: 'Produto excluído com sucesso' });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Erro ao excluir produto', details: error.message });
    }
  });

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

  const PORT = process.env.PORT || 10000;
  const API_URL = process.env.API_URL || `https://centrodecompra-backend.onrender.com`;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Diretório de uploads: ${uploadDir}`);
    console.log(`Diretório de produtos: ${produtosPath}`);
  });
});
