const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { connectToDatabase, getDocumentsCollection } = require('../config/mongodb');

async function main() {
  const outputPath = process.argv[2] || path.join(__dirname, '../../ml/data/documents-export.json');

  await connectToDatabase();
  const docs = await getDocumentsCollection().find({}, { projection: { _id: 0 } }).toArray();

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(docs, null, 2), 'utf8');
  console.log(`Exported ${docs.length} documents to ${outputPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Failed to export documents:', error.message);
  process.exit(1);
});
