const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // para gerar id único

const app = express();
const port = process.env.PORT || 1000;

// Configurar CORS para permitir requisições apenas do seu frontend
app.use(cors({
  origin: ['https://www.centrodecompra.com.br', 'http://localhost:3000'], // ajuste conforme seu frontend
}));

// Criar pasta uploads caso não exista
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
}

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Parsing JSON e urlencoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar Multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .png, .jpg e .jpeg são permitidos!'));
    }
  },
});

// Arquivo JSON dos produtos
const produtosFile = path.join(__dirname, 'produtos.json');

// Inicializar arquivo JSON se não existir
async function inicializarProdutos() {
  try {
    await fs.access(produtosFile);
  } catch {
    await fs.writeFile(produtosFile, JSON.stringify([]));
  }
}
inicializarProdutos();

// GET produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const data = await fs.readFile(produtosFile, 'utf8');
    const produtos = JSON.parse(data);
    res.json(produtos);
  } catch (error) {
    console.error('Erro ao carregar produtos:', error);
    res.status(500).json({ error: 'Erro ao carregar produtos' });
  }
});

// POST adicionar produto
app.post('/api/produtos', upload.array('imagens', 5), async (req, res) => {
  try {
    const { nome, preco, loja, categoria, link, descricao } = req.body;

    if (!nome || !preco || !loja || !categoria || !link) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const imagens = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    const novoProduto = {
      _id: uuidv4(), // gerando um id único para facilitar exclusão
      nome,
      descricao: descricao || '',
      preco: parseFloat(preco),
      loja,
      categoria,
      link,
      imagens,
    };

    const data = await fs.readFile(produtosFile, 'utf8');
    const produtos = JSON.parse(data);
    produtos.push(novoProduto);
    await fs.writeFile(produtosFile, JSON.stringify(produtos, null, 2));

    res.status(201).json(novoProduto);
  } catch (error) {
    console.error('Erro ao adicionar produto:', error);
    res.status(500).json({ error: 'Erro ao adicionar produto' });
  }
});

// DELETE produto
app.delete('/api/produtos/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const data = await fs.readFile(produtosFile, 'utf8');
    let produtos = JSON.parse(data);

    const produtoIndex = produtos.findIndex(p => p._id === id);
    if (produtoIndex === -1) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Opcional: deletar as imagens do produto do disco (não obrigatório, mas bom)
    const produto = produtos[produtoIndex];
    if (produto.imagens && produto.imagens.length > 0) {
      for (const imgPath of produto.imagens) {
        const fullPath = path.join(__dirname, 'public', imgPath);
        fs.unlink(fullPath).catch(() => {}); // tenta deletar, ignora erro se não conseguir
      }
    }

    produtos.splice(produtoIndex, 1);
    await fs.writeFile(produtosFile, JSON.stringify(produtos, null, 2));

    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao excluir produto' });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
