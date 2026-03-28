import { loadGraphQLTypeDefinitions } from '@reactory/server-core/graph/graphql-loader';
import path from 'path';

const typeDefs = loadGraphQLTypeDefinitions([
  'Pdf'
], path.join(__dirname, 'Pdf'), 'reactory-pdf-manager');

export default typeDefs;
