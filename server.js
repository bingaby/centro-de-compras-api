const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// Configuração do CORS
const corsOptions = {
  origin: 'https://www.centrodecompra.com.br', // Domínio do frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Cabeçalhos permitidos
  credentials: true, // Permite credenciais (para cookies ou autenticação)
};

// Aplicar CORS globalmente
app.use(cors(corsOptions));

// Garantir que requisições OPTIONS sejam tratadas explicitamente
app.options('*', cors(corsOptions));

// Middleware para parsing de JSON
app.use(express.json());

// Middleware de autenticação com JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  try {
    jwt.verify(token, 'sua-chave-secreta', (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Token inválido', details: err.message });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    return res.status(403).json({ error: 'Erro ao verificar token', details: error.message });
  }
};

// Rota de login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  // Credenciais fixas para demonstração
  if (username === 'Princesaeloah' && password === '13082015') {
    const token = jwt.sign({ user: username }, 'sua-chave-secreta', { expiresIn: '1h' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Credenciais inválidas' });
});

// Rotas de produtos (protegidas)
app.get('/api/produtos', authenticateToken, (req, res) => {
  // Lógica fictícia para retornar produtos
  const produtos = [
    { _id: '1', nome: 'Produto 1', categoria: 'eletronicos', loja: 'loja1', imagens: ['imagens/produto1.jpg'], link: '#' },
    { _id: '2', nome: 'Produto 2', categoria: 'roupas', loja: 'loja2', imagens: ['imagens/produto2.jpg'], link: '#' },
    // Adicione mais produtos conforme necessário
  ];
  res.json({
    produtos,
    total: produtos.length,
  });
});

app.get('/api/produtos/:id', authenticateToken, (req, res) => {
  // Lógica fictícia para retornar um produto específico
  res.json({ _id: req.params.id, nome: `Produto ${req.params.id}` });
});

app.post('/api/produtos', authenticateToken, (req, res) => {
  // Lógica para adicionar produto
  res.json({ message: 'Produto adicionado' });
});

app.put('/api/produtos/:id', authenticateToken, (req, res) => {
  // Lógica para atualizar produto
  res.json({ message: 'Produto atualizado' });
});

app.delete('/api/produtos/:id', authenticateToken, (req, res) => {
  // Lógica para excluir produto
  res.json({ message: 'Produto excluído' });
});

// Iniciar o servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
