import { mergeGraphResolver } from '@reactory/server-core/utils';
import PdfResolver from './PdfResolver';

export default mergeGraphResolver([
  PdfResolver,
]);
