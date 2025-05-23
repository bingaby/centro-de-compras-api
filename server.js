// server.js
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
    const data = await fs.readFile('produtos.json', 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Erro ao ler produtos.json:', error);
    res.status(500).json({ error: 'Erro ao carregar produtos' });
  }
});

// Endpoint para adicionar produto
app.post('/api/produtos', upload.array('imagens', 3), async (req, res) => {
  try {
    const { nome, categoria, loja, link, preco } = req.body;
    if (!nome || !categoria || !loja || !link || !preco) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    if (parseFloat(preco) < 0) {
      return res.status(400).json({ error: 'O preço deve ser positivo' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Pelo menos uma imagem é necessária' });
    }

    const imagens = req.files.map(file => `/upload/${file.filename}`);
    const novoProduto = { nome, categoria, loja, link, preco: parseFloat(preco), imagens };

    let produtos = [];
    try {
      const data = await fs.readFile('produtos.json', 'utf8');
      produtos = JSON.parse(data);
      if (!Array.isArray(produtos)) produtos = [];
    } catch (error) {
      produtos = [];
    }

    produtos.push(novoProduto);
    await fs.writeFile('produtos.json', JSON.stringify(produtos, null, 2));
    res.json({ message: 'Produto adicionado com sucesso', produto: novoProduto });
  } catch (error) {
    console.error('Erro ao adicionar produto:', error);
    res.status(500).json({ error: error.message || 'Erro ao adicionar produto' });
  }
});

// Endpoint para excluir produto
app.delete('/api/produtos/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    let produtos = [];
    try {
      const data = await fs.readFile('produtos.json', 'utf8');
      produtos = JSON.parse(data);
    } catch (error) {
      produtos = [];
    }

    if (index < 0 || index >= produtos.length) {
      return res.status(400).json({ error: 'Índice inválido' });
    }

    // Remover imagens associadas
    const imagens = produtos[index].imagens || [];
    for (const imagem of imagens) {
      const filePath = path.join(__dirname, imagem.replace('/upload/', 'upload/'));
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.warn(`Imagem ${filePath} não encontrada para exclusão`);
      }
    }

    produtos.splice(index, 1);
    await fs.writeFile('produtos.json', JSON.stringify(produtos, null, 2));
    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao excluir produto' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
