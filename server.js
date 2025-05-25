const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/rest');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// CORS
app.use(cors({
  origin: ['https://www.centrodecompra.com.br', 'http://localhost:8080', 'http://localhost:10000'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Verificar GITHUB_TOKEN
if (!process.env.GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN não configurado.');
  process.exit(1);
}

// GitHub config
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = 'bingaby';
const repoName = 'centrodecompra';
const produtosJsonPath = 'produtos.json';
const imagensDir = 'imagens';
const MAX_PRODUTOS = 1000;

// Criar diretório local de uploads
const uploadsDir = './uploads';
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Configurar Multer
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({ storage }).array('images');

// Servir arquivos estáticos
app.use(express.static('public'));

// Rota raiz
app.get('/', (req, res) => {
  res.json({ message: 'Servidor Centro de Compra ativo', version: '1.0.0' });
});

// Inicializar produtos.json se não existir
async function inicializarProdutosJson() {
  try {
    console.log('🔍 Verificando produtos.json...');
    await octokit.repos.getContent({ owner: repoOwner, repo: repoName, path: produtosJsonPath });
    console.log('✅ produtos.json já existe');
  } catch (error) {
    if (error.status === 404) {
      console.log('⚠️ produtos.json não encontrado. Criando...');
      await octokit.repos.createOrUpdateFileContents({
        owner: repoOwner,
        repo: repoName,
        path: produtosJsonPath,
        message: 'Inicializa produtos.json',
        content: Buffer.from(JSON.stringify([])).toString('base64')
      });
      console.log('✅ produtos.json criado');
    } else {
      console.error('❌ Erro ao verificar produtos.json:', error);
      throw error;
    }
  }
}

// GET /api/produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const startIndex = (page - 1) * limit;

    const { data } = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: produtosJsonPath
    });

    const produtos = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    if (!Array.isArray(produtos)) throw new Error('produtos.json não é um array');

    const paginados = produtos.slice(startIndex, startIndex + limit);
    res.json(paginados);
  } catch (error) {
    console.error('❌ Erro ao obter produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos', details: error.message });
  }
});

// POST /api/produtos
app.post('/api/produtos', upload, async (req, res) => {
  try {
    const { nome, idProduto, descricao, categoria, loja, link, preco, imagens: imagensUrls } = req.body;
    const imagens = req.files || [];

    const { data: currentData } = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: produtosJsonPath
    });

    const produtos = JSON.parse(Buffer.from(currentData.content, 'base64').toString('utf8'));
    if (produtos.length >= MAX_PRODUTOS) {
      return res.status(400).json({ error: 'Limite de produtos atingido' });
    }

    let imagemUrls = [];

    if (imagensUrls && Array.isArray(JSON.parse(imagensUrls || '[]'))) {
      imagemUrls = JSON.parse(imagensUrls).filter(url => url.startsWith('https://'));
    }

    if (imagens.length > 0) {
      const uploadImages = await Promise.all(imagens.map(async (file) => {
        const buffer = await fs.readFile(file.path);
        const pathGit = `${imagensDir}/${file.filename}`;
        await octokit.repos.createOrUpdateFileContents({
          owner: repoOwner,
          repo: repoName,
          path: pathGit,
          message: `Adiciona imagem ${file.filename}`,
          content: buffer.toString('base64')
        });
        return `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${pathGit}`;
      }));
      imagemUrls = imagemUrls.concat(uploadImages);
    }

    produtos.push({
      nome,
      id: idProduto,
      descricao,
      categoria,
      loja,
      link,
      preco: parseFloat(preco),
      imagens: imagemUrls.length ? imagemUrls : [`https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/imagens/placeholder.jpg`]
    });

    await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path: produtosJsonPath,
      message: `Adiciona produto ${nome}`,
      content: Buffer.from(JSON.stringify(produtos, null, 2)).toString('base64'),
      sha: currentData.sha
    });

    await Promise.all(imagens.map(file => fs.unlink(file.path).catch(() => {})));
    res.status(201).json({ message: 'Produto adicionado com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao adicionar produto:', error);
    res.status(500).json({ error: 'Erro ao adicionar produto', details: error.message });
  }
});

// DELETE /api/produtos/:id
app.delete('/api/produtos/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const { data } = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: produtosJsonPath
    });

    let produtos = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    const produto = produtos.find(p => p.id === id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    await Promise.all(produto.imagens.map(async (url) => {
      if (url.includes('placeholder.jpg')) return;
      const pathGit = url.split(`https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/`)[1];
      try {
        const { data: imgData } = await octokit.repos.getContent({
          owner: repoOwner,
          repo: repoName,
          path: pathGit
        });
        await octokit.repos.deleteFile({
          owner: repoOwner,
          repo: repoName,
          path: pathGit,
          message: `Remove imagem ${pathGit}`,
          sha: imgData.sha
        });
      } catch (err) {
        console.warn(`⚠️ Imagem não encontrada ou já removida: ${pathGit}`);
      }
    }));

    produtos = produtos.filter(p => p.id !== id);

    await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path: produtosJsonPath,
      message: `Remove produto ${id}`,
      content: Buffer.from(JSON.stringify(produtos, null, 2)).toString('base64'),
      sha: data.sha
    });

    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao excluir produto', details: error.message });
  }
});

// Inicializar e iniciar servidor
inicializarProdutosJson()
  .then(() => {
    app.listen(PORT, () => console.log(`✅ Servidor rodando em http://localhost:${PORT}`));
  })
  .catch(error => {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  });
