const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/core');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware com CORS configurado corretamente
app.use(cors({
  origin: 'https://www.centrodecompra.com.br',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use('/upload', express.static(path.join(__dirname, 'upload')));

// Criar diretório de upload temporário
fs.mkdir('upload', { recursive: true }).catch((err) =>
  console.error('Erro ao criar diretório de upload:', err)
);

// Configuração do Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'upload/');
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const nomeProduto = req.body.nome ? req.body.nome.replace(/\s+/g, '-').toLowerCase() : 'produto';
    const ext = path.extname(file.originalname);
    cb(null, `produto_${nomeProduto}-${timestamp}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens são permitidas!'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Máximo 2MB
  fileFilter,
});

// Inicializar Octokit
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Endpoint para listar produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: 'bingaby',
      repo: 'centrodecompra',
      path: 'produtos.json',
    });
    const produtos = JSON.parse(Buffer.from(response.data.content, 'base64').toString());
    res.json(produtos);
  } catch (error) {
    if (error.status === 404) {
      res.json([]);
    } else {
      console.error('Erro ao carregar produtos:', error);
      res.status(500).json({ error: 'Erro ao carregar produtos' });
    }
  }
});

// Endpoint para adicionar produto
app.post('/api/produtos', upload.array('imagens', 3), async (req, res) => {
  try {
    console.log('Recebendo POST /api/produtos', req.body, req.files);
    const { nome, descricao, categoria, loja, link, preco } = req.body;

    if (!nome || !categoria || !loja || !link || !preco) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const precoFloat = parseFloat(preco);
    if (isNaN(precoFloat) || precoFloat < 0) {
      return res.status(400).json({ error: 'O preço deve ser um número positivo' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Pelo menos uma imagem é necessária' });
    }

    // Upload das imagens
    const imagens = [];
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'centrodecompra',
      });
      imagens.push(result.secure_url);
      await fs.unlink(file.path); // Remove temporário
    }

    // Carrega produtos existentes
    let produtos = [];
    let sha;
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: 'bingaby',
        repo: 'centrodecompra',
        path: 'produtos.json',
      });
      produtos = JSON.parse(Buffer.from(response.data.content, 'base64').toString());
      sha = response.data.sha;
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    // Novo produto
    const novoProduto = {
      _id: `${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
      nome,
      descricao,
      categoria,
      loja,
      link,
      preco: precoFloat,
      imagens,
    };
    produtos.push(novoProduto);

    // Verifica tamanho
    const jsonContent = JSON.stringify(produtos, null, 2);
    if (new TextEncoder().encode(jsonContent).length > 90 * 1024 * 1024) {
      return res.status(400).json({ error: 'produtos.json excede 90 MB' });
    }

    // Atualiza GitHub
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: 'bingaby',
      repo: 'centrodecompra',
      path: 'produtos.json',
      message: 'Adiciona novo produto via servidor',
      content: Buffer.from(jsonContent).toString('base64'),
      sha,
      branch: 'main',
    });

    res.status(201).json({ message: 'Produto adicionado com sucesso', produto: novoProduto });
  } catch (error) {
    console.error('Erro ao adicionar produto:', error);
    res.status(500).json({ error: error.message || 'Erro ao adicionar produto' });
  }
});

// Endpoint para excluir produto
app.delete('/api/produtos/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'ID do produto é obrigatório' });
    }

    let produtos = [];
    let sha;
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: 'bingaby',
        repo: 'centrodecompra',
        path: 'produtos.json',
      });
      produtos = JSON.parse(Buffer.from(response.data.content, 'base64').toString());
      sha = response.data.sha;
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({ error: 'Nenhum produto encontrado' });
      }
      throw error;
    }

    const index = produtos.findIndex((produto) => produto._id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Remove imagens do Cloudinary
    const imagens = produtos[index].imagens || [];
    for (const imagem of imagens) {
      const publicId = imagem.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`centrodecompra/${publicId}`);
    }

    // Remove produto
    produtos.splice(index, 1);

    const jsonContent = JSON.stringify(produtos, null, 2);
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: 'bingaby',
      repo: 'centrodecompra',
      path: 'produtos.json',
      message: 'Remove produto via servidor',
      content: Buffer.from(jsonContent).toString('base64'),
      sha,
      branch: 'main',
    });

    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao excluir produto' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
