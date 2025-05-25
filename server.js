const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const app = express();
const port = process.env.PORT || 1000;

// Configurar CORS para permitir requisições do frontend
app.use(cors());

// Configurar pasta pública para servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Configurar parsing de dados do formulário
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar Multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
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

// Caminho para o arquivo JSON de produtos
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

// Endpoint para carregar produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const data = await fs.readFile(produtosFile, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Erro ao carregar produtos:', error);
    res.status(500).json({ error: 'Erro ao carregar produtos' });
  }
});

// Endpoint para adicionar produto
app.post('/api/produtos', upload.array('imagens', 5), async (req, res) => {
  try {
    const { nome, preco, loja, categoria, link } = req.body;
    const imagens = req.files.map(file => `/uploads/${file.filename}`);

    const novoProduto = {
      nome,
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

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
