const express = require('express');
const cors = require('cors');
const app = express();

// Configuração do CORS
const corsOptions = {
  origin: 'https://www.centrodecompra.com.br', // Domínio do frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Cabeçalhos permitidos
  credentials: true, // Permite credenciais (opcional, para cookies ou autenticação)
};

app.use(cors(corsOptions));

// Middleware para parsing de JSON e FormData
app.use(express.json());

// Exemplo de autenticação com JWT
const jwt = require('jsonwebtoken');
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    jwt.verify(token, 'sua-chave-secreta');
    next();
  } catch {
    res.status(403).json({ error: 'Token inválido' });
  }
};

// Rota de login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'xyz123') {
    const token = jwt.sign({ user: username }, 'sua-chave-secreta', { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Credenciais inválidas' });
  }
});

// Rotas de produtos (protegidas)
app.get('/api/produtos', authenticateToken, (req, res) => {
  // Lógica para retornar produtos
  res.json({ produtos: [], total: 0 });
});

app.get('/api/produtos/:id', authenticateToken, (req, res) => {
  // Lógica para retornar um produto específico
  res.json({ _id: req.params.id, nome: 'Produto Exemplo' });
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
