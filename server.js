// server.js
const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/core');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/upload', express.static(path.join(__dirname, 'upload')));

// Criar diretório de upload se não existir
fs.mkdir('upload', { recursive: true }).catch(console.error);

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
  }
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
  fileFilter
});

// Inicializar Octokit
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Endpoint para listar produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: 'bingaby',
      repo: 'centrodecompra',
      path: 'produtos.json'
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
    const { nome, descricao, categoria, loja, link, preco } = req.body;

    // Validação dos campos obrigatórios
    if (!nome || !categoria || !loja || !link || !preco) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    if (parseFloat(preco) < 0) {
      return res.status(400).json({ error: 'O preço deve ser positivo' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Pelo menos uma imagem é necessária' });
    }

    // Gerar URLs para imagens
    const imagens = req.files.map(file => `${process.env.SERVER_URL}/upload/${file.filename}`);

    // Carregar produtos.json atual
    let produtos = [];
    let sha;
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: 'bingaby',
        repo: 'centrodecompra',
        path: 'produtos.json'
      });
      produtos = JSON.parse(Buffer.from(response.data.content, 'base64').toString());
      sha = response.data.sha;
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }

    // Adicionar novo produto
    const novoProduto = {
      _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      nome,
      descricao,
      categoria,
      loja,
      link,
      preco: parseFloat(preco),
      imagens
    };
    produtos.push(novoProduto);

    // Validar tamanho do JSON
    const jsonContent = JSON.stringify(produtos, null, 2);
    if (new TextEncoder().encode(jsonContent).length > 90 * 1024 * 1024) {
      return res.status(400).json({ error: 'produtos.json excede 90 MB' });
    }

    // Atualizar produtos.json no GitHub
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: 'bingaby',
      repo: 'centrodecompra',
      path: 'produtos.json',
      message: 'Adiciona novo produto via servidor',
      content: Buffer.from(jsonContent).toString('base64'),
      sha,
      branch: 'main'
    });

    // Salvar localmente como backup
    await fs.writeFile('produtos.json', jsonContent);

    res.status(201).json({ message: 'Produto adicionado com sucesso', produto: novoProduto });
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
    let sha;

    // Carregar produtos.json do GitHub
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: 'bingaby',
        repo: 'centrodecompra',
        path: 'produtos.json'
      });
      produtos = JSON.parse(Buffer.from(response.data.content, 'base64').toString());
      sha = response.data.sha;
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({ error: 'Nenhum produto encontrado' });
      }
      throw error;
    }

    if (index < 0 || index >= produtos.length) {
      return res.status(400).json({ error: 'Índice inválido' });
    }

    // Remover imagens associadas
    const imagens = produtos[index].imagens || [];
    for (const imagem of imagens) {
      const filePath = path.join(__dirname, 'upload', path.basename(imagem));
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.warn(`Imagem ${filePath} não encontrada para exclusão`);
      }
    }

    // Remover produto
    produtos.splice(index, 1);

    // Atualizar produtos.json no GitHub
    const jsonContent = JSON.stringify(produtos, null, 2);
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: 'bingaby',
      repo: 'centrodecompra',
      path: 'produtos.json',
      message: 'Remove produto via servidor',
      content: Buffer.from(jsonContent).toString('base64'),
      sha,
      branch: 'main'
    });

    // Atualizar arquivo local
    await fs.writeFile('produtos.json', jsonContent);

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
