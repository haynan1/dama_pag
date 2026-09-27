/**
 * Botão voltar do Android: uma pilha de tratadores. O mais recente decide primeiro (uma folha
 * aberta fecha antes de a tela recuar; a fase pede confirmação antes de sair). Sem tratador,
 * volta no histórico — e na raiz, fecha o app, como todo app Android.
 */
type Handler = () => boolean;
const stack: Handler[] = [];

export function onBack(handler: Handler): () => void {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Executa os tratadores do topo para a base; `true` se algum consumiu o evento. */
export function dispatchBack(): boolean {
  const open = document.querySelector('dialog[open]:not([data-locked])');
  if (open instanceof HTMLDialogElement) {
    open.close();
    return true;
  }
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!()) return true;
  return false;
}
