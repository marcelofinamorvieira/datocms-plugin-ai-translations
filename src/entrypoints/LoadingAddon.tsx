import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk';
import { Canvas } from 'datocms-react-ui';

type PropTypes = {
  ctx: RenderFieldExtensionCtx;
};

function LoadingAddon({ ctx }: PropTypes) {
  return <Canvas ctx={ctx}>Loading...</Canvas>;
}

export default LoadingAddon;
