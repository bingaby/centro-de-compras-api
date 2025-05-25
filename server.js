const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/rest');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Configuração CORS
app.use(cors({
  origin: ['https://www.centrodecompra.com.br', 'http://localhost:8080'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Configuração do Multer
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({ storage }).array('images');

// Configuração do Octokit
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = 'bingaby';
const repoName = 'centrodecompra';
const produtosJsonPath = 'produtos.json';
const imagensDir = 'imagens';
const MAX_PRODUTOS = 1000;

// Servir arquivos estáticos
app.use(express.static('public'));

// Endpoint para obter produtos
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
    const produtosFiltrados = produtos.slice(startIndex, startIndex + limit);

    res.json(produtosFiltrados);
  } catch (error) {
    console.error('Erro ao obter produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// Endpoint para criar produto
app.post('/api/produtos', upload, async (req, res) => {
  try {
    const { nome, idProduto, descricao, categoria, loja, link, preco } = req.body;
    const imagens = req.files || [];

    // Verificar limite de produtos
    const { data: currentData } = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: produtosJsonPath
    });
    const produtos = JSON.parse(Buffer.from(currentData.content, 'base64').toString('utf8'));
    if (produtos.length >= MAX_PRODUTOS) {
      return res.status(400).json({ error: 'Limite de 1.000 produtos atingido' });
    }

    // Upload de imagens
    const imagemUrls = await Promise.all(imagens.map(async (file) => {
      const imagemContent = await fs.readFile(file.path);
      const imagemPath = `${imagensDir}/${file.filename}`;

      await octokit.repos.createOrUpdateFileContents({
        owner: repoOwner,
        repo: repoName,
        path: imagemPath,
        message: `Adiciona imagem ${file.filename}`,
        content: imagemContent.toString('base64')
      });

      return `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${imagemPath}`;
    }));

    // Atualizar produtos.json
    produtos.push({
      nome,
      id: idProduto,
      descricao,
      categoria,
      loja,
      link,
      preco: parseFloat(preco),
      imagens: imagemUrls
    });

    await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path: produtosJsonPath,
      message: `Adiciona produto ${nome}`,
      content: Buffer.from(JSON.stringify(produtos, null, 2)).toString('base64'),
      sha: currentData.sha
    });

    // Remover arquivos locais
    await Promise.all(imagens.map(file => fs.unlink(file.path)));

    res.status(201).json({ message: 'Produto adicionado com sucesso' });
  } catch (error) {
    console.error('Erro ao adicionar produto:', error);
    res.status(500).json({ error: 'Erro ao adicionar produto' });
  }
});

// Endpoint para excluir produto
app.delete('/api/produtos/:id', async (req, res) => {
  try {
    const idProduto = req.params.id;

    const { data } = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: produtosJsonPath
    });

    let produtos = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    const produto = produtos.find(p => p.id === idProduto);
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Remover imagens
    await Promise.all(produto.imagens.map(async (url) => {
      const imagemPath = url.split(`https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/`)[1];
      try {
        const { data: imagemData } = await octokit.repos.getContent({
          owner: repoOwner,
          repo: repoName,
          path: imagemPath
        });
        await octokit.repos.deleteFile({
          owner: repoOwner,
          repo: repoName,
          path: imagemPath,
          message: `Remove imagem ${imagemPath}`,
          sha: imagemData.sha
        });
      } catch (error) {
        console.warn(`Imagem ${imagemPath} não encontrada`, error);
      }
    }));

    // Remover produto
    produtos = produtos.filter(p => p.id !== idProduto);

    await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path: produtosJsonPath,
      message: `Remove produto ${idProduto}`,
      content: Buffer.from(JSON.stringify(produtos, null, 2)).toString('base64'),
      sha: data.sha
    });

    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao excluir produto' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
