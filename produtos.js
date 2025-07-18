import { google } from 'googleapis';

const {
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  PLANILHA_ID,
  PASTA_DRIVE_ID
} = process.env;

if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !PLANILHA_ID || !PASTA_DRIVE_ID) {
  throw new Error('Faltando variáveis de ambiente. Configure GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, PLANILHA_ID e PASTA_DRIVE_ID.');
}

const auth = new google.auth.JWT(
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
  ]
);

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

async function salvarImagemBase64(base64String, nomeArquivo) {
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const res = await drive.files.create({
    requestBody: {
      name: nomeArquivo,
      parents: [PASTA_DRIVE_ID],
      mimeType: 'image/jpeg'
    },
    media: {
      mimeType: 'image/jpeg',
      body: buffer
    },
    fields: 'id'
  });

  const fileId = res.data.id;

  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    }
  });

  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const data = req.body;

    let imagensUrls = [];
    if (data.imagensBase64 && Array.isArray(data.imagensBase64)) {
      imagensUrls = await Promise.all(
        data.imagensBase64.map((imgBase64, index) =>
          salvarImagemBase64(imgBase64, `${data.nome || 'produto'}_${Date.now()}_${index}.jpg`)
        )
      );
    }

    const linha = [
      data.nome || '',
      data.descricao || '',
      data.categoria || '',
      data.loja || '',
      data.link || '',
      data.preco || '',
      imagensUrls.join(','),
      new Date().toISOString()
    ];

    if (data.rowIndex) {
      const rowIndex = parseInt(data.rowIndex, 10);
      if (rowIndex < 2) throw new Error('Índice de linha inválido.');

      await sheets.spreadsheets.values.update({
        spreadsheetId: PLANILHA_ID,
        range: `Produtos!A${rowIndex}:H${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [linha] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: PLANILHA_ID,
        range: 'Produtos!A:H',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [linha] }
      });
    }

    res.status(200).json({ success: true, imagemUrls: imagensUrls });
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}