const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; // Usar fs.promises para async/await
const path = require('path');
const multer = require('multer');
const app = express();

// --- Configurações do Servidor ---
app.use(cors()); // Permite requisições de diferentes origens (CORS)
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições
// Serve arquivos estáticos da pasta 'upload'
app.use('/upload', express.static(path.join(__dirname, 'upload')));

// --- Configuração do Multer para Upload de Imagens ---
const storage = multer.diskStorage({
    // Define o diretório onde os arquivos serão salvos
    destination: (req, file, cb) => {
        cb(null, 'upload/');
    },
    // Define o nome do arquivo no disco
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        // Normaliza o nome do produto para ser parte do nome do arquivo
        const nomeProduto = req.body.nome ? req.body.nome.replace(/\s+/g, '-').toLowerCase() : 'produto';
        const ext = path.extname(file.originalname); // Pega a extensão original do arquivo
        cb(null, `produto_${nomeProduto}-${timestamp}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // Limite de tamanho do arquivo: 2MB
    fileFilter: (req, file, cb) => {
        // Filtra para aceitar apenas arquivos de imagem
        if (file.mimetype.startsWith('image/')) {
            cb(null, true); // Aceita o arquivo
        } else {
            cb(new Error('Apenas imagens são permitidas!')); // Rejeita o arquivo
        }
    }
});

// --- Criação da Pasta de Upload ---
// Garante que a pasta 'upload' exista. Se não existir, a cria.
fs.mkdir('upload', { recursive: true })
    .then(() => console.log('Pasta "upload" verificada/criada com sucesso.'))
    .catch(err => console.error('Erro ao criar pasta "upload":', err));

// --- Endpoint para Listar Produtos ---
app.get('/api/produtos', async (req, res) => {
    try {
        let produtos = [];
        let fileContent = '[]'; // Conteúdo padrão para o arquivo, caso esteja vazio ou não exista

        try {
            fileContent = await fs.readFile('produtos.json', 'utf8');
            // Se o arquivo estiver vazio ou contiver apenas espaços em branco,
            // tratamos como um array JSON vazio para evitar erro de parse.
            if (fileContent.trim() === '') {
                fileContent = '[]';
            }
        } catch (error) {
            // Se o arquivo não for encontrado (ENOENT), o criamos como um array vazio.
            if (error.code === 'ENOENT') {
                await fs.writeFile('produtos.json', '[]', 'utf8');
                console.log('produtos.json não encontrado, criado como array vazio.');
                fileContent = '[]'; // Garante que o conteúdo para parse seja um array vazio
            } else {
                // Outros erros de leitura de arquivo são propagados para o catch externo.
                console.error('Erro ao ler produtos.json (fora de ENOENT):', error);
                throw error;
            }
        }

        try {
            produtos = JSON.parse(fileContent);
            // Garante que 'produtos' seja sempre um array, mesmo se o JSON for inválido
            // ou se o arquivo contiver algo que não seja um array JSON.
            if (!Array.isArray(produtos)) {
                console.warn('produtos.json contém JSON inválido ou não é um array. Inicializando como array vazio.');
                produtos = [];
                // Opcionalmente, sobrescreve o arquivo com um array vazio para corrigir a corrupção
                await fs.writeFile('produtos.json', '[]', 'utf8');
            }
        } catch (error) {
            // Erro de parsing JSON (e.g., JSON malformado)
            console.warn('produtos.json contém JSON malformado. Inicializando como array vazio.', error);
            produtos = [];
            // Sobrescreve o arquivo com um array vazio para corrigir a corrupção
            await fs.writeFile('produtos.json', '[]', 'utf8');
        }

        // --- Lógica de Filtragem ---
        let produtosFiltrados = produtos;

        const categoriaFiltro = req.query.categoria?.toLowerCase();
        const lojaFiltro = req.query.loja?.toLowerCase();
        const termoBuscaFiltro = req.query.termoBusca?.toLowerCase();

        if (categoriaFiltro && categoriaFiltro !== 'todas') {
            produtosFiltrados = produtosFiltrados.filter(p => p.categoria?.toLowerCase() === categoriaFiltro);
        }
        if (lojaFiltro && lojaFiltro !== 'todas') {
            produtosFiltrados = produtosFiltrados.filter(p => p.loja?.toLowerCase() === lojaFiltro);
        }
        if (termoBuscaFiltro) {
            produtosFiltrados = produtosFiltrados.filter(p =>
                p.nome?.toLowerCase().includes(termoBuscaFiltro) ||
                p.descricao?.toLowerCase().includes(termoBuscaFiltro) ||
                p.categoria?.toLowerCase().includes(termoBuscaFiltro) ||
                p.loja?.toLowerCase().includes(termoBuscaFiltro)
            );
        }

        const totalProdutosFiltrados = produtosFiltrados.length;

        // --- Lógica de Paginação ---
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 24; // Padrão 24 para corresponder ao frontend
        const startIndex = (page - 1) * limit;
        const paginatedProdutosFiltrados = produtosFiltrados.slice(startIndex, startIndex + limit);

        // Envia a resposta com os produtos filtrados e paginados
        res.json({
            produtos: paginatedProdutosFiltrados,
            total: totalProdutosFiltrados,
            page,
            limit
        });

    } catch (error) {
        // Captura qualquer erro que ocorra durante o processo e envia uma resposta 500
        console.error('Erro fatal ao carregar produtos na API:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao carregar produtos.' });
    }
});

// --- Endpoint para Adicionar Produto ---
app.post('/api/produtos', upload.array('imagens', 3), async (req, res) => {
    try {
        const { nome, categoria, loja, link, preco } = req.body;

        // Validação de campos obrigatórios
        if (!nome || !categoria || !loja || !link || !preco) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        // Validação de preço
        if (parseFloat(preco) < 0) {
            return res.status(400).json({ error: 'O preço deve ser positivo' });
        }
        // Validação de imagens
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Pelo menos uma imagem é necessária' });
        }

        // Mapeia os caminhos das imagens para URLs
        const imagens = req.files.map(file => `/upload/${file.filename}`);

        // Cria o novo objeto de produto
        const novoProduto = {
            _id: Date.now() + Math.random().toString(36).substring(2, 9), // ID único
            nome,
            categoria,
            loja,
            link,
            preco: parseFloat(preco),
            imagens
        };

        let produtos = [];
        try {
            const data = await fs.readFile('produtos.json', 'utf8');
            produtos = JSON.parse(data);
            if (!Array.isArray(produtos)) {
                console.warn('produtos.json não contém um array ao adicionar, inicializando como vazio');
                produtos = [];
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                produtos = []; // Se o arquivo não existir, inicia com array vazio
            } else {
                throw error; // Outros erros de leitura são propagados
            }
        }

        produtos.push(novoProduto); // Adiciona o novo produto ao array
        // Escreve o array atualizado de volta no arquivo JSON, formatado para legibilidade
        await fs.writeFile('produtos.json', JSON.stringify(produtos, null, 2));

        res.status(201).json({ message: 'Produto adicionado com sucesso', produto: novoProduto }); // 201 Created
    } catch (error) {
        console.error('Erro ao adicionar produto:', error);
        // Envia uma resposta de erro, incluindo a mensagem de erro se disponível
        res.status(500).json({ error: error.message || 'Erro ao adicionar produto' });
    }
});

// --- Endpoint para Excluir Produto ---
app.delete('/api/produtos/:id', async (req, res) => { // Mudado de :index para :id para ser mais RESTful
    try {
        const productId = req.params.id; // Pega o ID do produto da URL

        let produtos = [];
        try {
            const data = await fs.readFile('produtos.json', 'utf8');
            produtos = JSON.parse(data);
            if (!Array.isArray(produtos)) {
                console.warn('produtos.json não contém um array ao excluir, inicializando como vazio');
                produtos = [];
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                produtos = [];
            } else {
                throw error;
            }
        }

        // Encontra o índice do produto a ser excluído pelo _id
        const produtoIndex = produtos.findIndex(p => p._id === productId);

        if (produtoIndex === -1) {
            return res.status(404).json({ error: 'Produto não encontrado para exclusão' });
        }

        const imagensParaExcluir = produtos[produtoIndex].imagens || [];

        // Exclui as imagens associadas ao produto
        for (const imagemPath of imagensParaExcluir) {
            // Constrói o caminho completo do arquivo no sistema de arquivos
            const filePath = path.join(__dirname, imagemPath.replace('/upload/', 'upload/'));
            try {
                await fs.unlink(filePath); // Tenta excluir o arquivo
                console.log(`Imagem excluída: ${filePath}`);
            } catch (err) {
                // Apenas um aviso se a imagem não for encontrada (já pode ter sido excluída)
                console.warn(`Imagem ${filePath} não encontrada para exclusão ou erro ao excluir:`, err.message);
            }
        }

        // Remove o produto do array
        produtos.splice(produtoIndex, 1);
        // Escreve o array atualizado de volta no arquivo JSON
        await fs.writeFile('produtos.json', JSON.stringify(produtos, null, 2));

        res.json({ message: 'Produto excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        res.status(500).json({ error: 'Erro ao excluir produto' });
    }
});

// --- Porta do Servidor ---
const PORT = process.env.PORT || 3000; // Usa a porta do ambiente ou 3000 como padrão
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
