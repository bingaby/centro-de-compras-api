const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; // Usar fs.promises para async/await (para exclusão de arquivos locais)
const path = require('path');
const multer = require('multer');
const admin = require('firebase-admin'); // Importa o SDK Admin do Firebase

// --- Inicialização do Firebase Admin SDK ---
// Carrega a chave da conta de serviço da variável de ambiente.
// É mais seguro armazenar o conteúdo JSON como uma única string na variável de ambiente
// e depois fazer o parse aqui.
const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountString) {
    console.error('ERRO: A variável de ambiente FIREBASE_SERVICE_ACCOUNT_KEY não está definida.');
    console.error('Por favor, configure-a no Render com o conteúdo do seu arquivo JSON de credenciais do Firebase.');
    process.exit(1); // Sai da aplicação se as credenciais não forem encontradas
}

try {
    const serviceAccount = JSON.parse(serviceAccountString);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
        // Se você precisar de acesso ao Realtime Database ou Storage, adicione databaseURL ou storageBucket aqui
        // databaseURL: "https://<YOUR_PROJECT_ID>.firebaseio.com"
    });
    console.log('Firebase Admin SDK inicializado com sucesso.');
} catch (error) {
    console.error('ERRO: Falha ao inicializar Firebase Admin SDK. Verifique o formato da sua variável de ambiente FIREBASE_SERVICE_ACCOUNT_KEY.', error);
    process.exit(1); // Sai da aplicação se a inicialização falhar
}

// Obtém uma referência para o Firestore
const db = admin.firestore();
const produtosCollection = db.collection('produtos'); // Referência à coleção 'produtos' no Firestore

// --- Configurações do Servidor ---
const app = express();
app.use(cors()); // Permite requisições de diferentes origens (CORS)
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições
// Serve arquivos estáticos da pasta 'upload' (para as imagens)
app.use('/upload', express.static(path.join(__dirname, 'upload')));

// --- Configuração do Multer para Upload de Imagens ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'upload/'); // Salva temporariamente na pasta 'upload' do servidor
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const nomeProduto = req.body.nome ? req.body.nome.replace(/\s+/g, '-').toLowerCase() : 'produto-sem-nome';
        const ext = path.extname(file.originalname);
        cb(null, `produto_${nomeProduto}-${timestamp}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // Limite de tamanho do arquivo: 2MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas!'));
        }
    }
});

// --- Criação da Pasta de Upload (ainda necessária para o Multer) ---
fs.mkdir('upload', { recursive: true })
    .then(() => console.log('Pasta "upload" verificada/criada com sucesso para uploads temporários.'))
    .catch(err => console.error('Erro ao criar pasta "upload":', err));

// --- Endpoint para Listar Produtos ---
app.get('/api/produtos', async (req, res) => {
    try {
        // Busca todos os documentos da coleção 'produtos' no Firestore
        const snapshot = await produtosCollection.get();
        let produtos = [];
        snapshot.forEach(doc => {
            // Adiciona o ID do documento do Firestore como _id para compatibilidade com o frontend
            produtos.push({ _id: doc.id, ...doc.data() });
        });

        // --- Lógica de Filtragem (aplicada aos dados do Firestore) ---
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
                p.descricao?.toLowerCase().includes(termoBuscaFiltro) || // Adicionado descrição ao filtro
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
        console.error('Erro ao carregar produtos do Firestore:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao carregar produtos.' });
    }
});

// --- Endpoint para Adicionar Produto ---
app.post('/api/produtos', upload.array('imagens', 3), async (req, res) => {
    try {
        const { nome, categoria, loja, link, preco, descricao } = req.body; // Incluindo 'descricao'

        // Validação de campos obrigatórios
        if (!nome || !categoria || !loja || !link || !preco) {
            // Retorna 400 Bad Request com uma mensagem clara
            return res.status(400).json({ error: 'Todos os campos obrigatórios (nome, categoria, loja, link, preco) são necessários.' });
        }
        // Validação de preço
        if (parseFloat(preco) < 0) {
            return res.status(400).json({ error: 'O preço deve ser positivo.' });
        }
        // Validação de imagens
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Pelo menos uma imagem é necessária.' });
        }

        // Mapeia os caminhos das imagens para URLs acessíveis publicamente
        // Lembre-se: Imagens na pasta 'upload' do Render são efêmeras!
        const imagens = req.files.map(file => `/upload/${file.filename}`);

        // Cria o novo objeto de produto
        const novoProduto = {
            nome,
            descricao: descricao || '', // Garante que a descrição exista, mesmo que vazia
            categoria,
            loja,
            link,
            preco: parseFloat(preco),
            imagens,
            createdAt: admin.firestore.FieldValue.serverTimestamp() // Adiciona um timestamp de criação
        };

        // Adiciona o novo produto à coleção 'produtos' no Firestore
        const docRef = await produtosCollection.add(novoProduto);

        // Retorna o produto adicionado com o ID gerado pelo Firestore
        res.status(201).json({ message: 'Produto adicionado com sucesso', produto: { _id: docRef.id, ...novoProduto } });
    } catch (error) {
        console.error('Erro ao adicionar produto no Firestore:', error);
        res.status(500).json({ error: error.message || 'Erro interno do servidor ao adicionar produto.' });
    }
});

// --- Endpoint para Excluir Produto ---
app.delete('/api/produtos/:id', async (req, res) => {
    try {
        const productId = req.params.id; // Pega o ID do produto da URL

        // Busca o documento do produto no Firestore para obter os caminhos das imagens
        const productDoc = await produtosCollection.doc(productId).get();

        if (!productDoc.exists) {
            return res.status(404).json({ error: 'Produto não encontrado para exclusão.' });
        }

        const imagensParaExcluir = productDoc.data().imagens || [];

        // Exclui o produto do Firestore
        await produtosCollection.doc(productId).delete();
        console.log(`Produto ${productId} excluído do Firestore.`);

        // Tenta excluir as imagens associadas do disco local (ainda efêmero no Render)
        for (const imagemPath of imagensParaExcluir) {
            const filePath = path.join(__dirname, imagemPath.replace('/upload/', 'upload/'));
            try {
                await fs.unlink(filePath); // Tenta excluir o arquivo
                console.log(`Imagem excluída do disco: ${filePath}`);
            } catch (err) {
                // Apenas um aviso se a imagem não for encontrada (já pode ter sido excluída ou não existia)
                console.warn(`Aviso: Imagem ${filePath} não encontrada no disco ou erro ao excluir:`, err.message);
            }
        }

        res.json({ message: 'Produto excluído com sucesso do Firestore e imagens do disco (se existiam).' });

    } catch (error) {
        console.error('Erro ao excluir produto do Firestore:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao excluir produto.' });
    }
});

// --- Porta do Servidor ---
const PORT = process.env.PORT || 3000; // Usa a porta do ambiente (definida pelo Render) ou 3000 como padrão
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
