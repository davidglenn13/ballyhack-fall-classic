/* Keep setup prominent until the wager is saved, then prioritize score entry. */
(() => {
  function enhance(){
    const card=document.querySelector('.scoring-card');
    if(!card)return;
    const head=card.querySelector('.scoring-head');
    const sync=card.querySelector('.sync-panel');
    if(head&&sync){
      const title=head.querySelector('h2');
      if(title&&typeof currentUser==='function'){
        const user=document.createElement('span');
        user.className='score-signed-in';
        user.textContent=currentUser();
        title.insertAdjacentElement('afterend',user);
      }
      head.appendChild(sync);
    }

    const picker=document.querySelector('.side-game-picker-detached');
    const wager=picker?.querySelector('[data-nlp-wager], [data-fbw-wager]');
    const readonly=picker?.querySelector('.fbw-readonly');
    const amount=Number(wager?.value||0);
    const saved=picker&&(amount>0||readonly&&/\$\s*\d+/.test(readonly.textContent));
    if(!saved)return;

    /* Once setup is complete, keep Game + Wager beneath the Press Bet section. */
    const pressCard=document.querySelector('.nlp-card');
    if(pressCard&&picker.previousElementSibling!==pressCard){
      pressCard.insertAdjacentElement('afterend',picker);
    }

    picker.classList.add('mobile-game-saved');
    const summary=document.createElement('div');
    summary.className='mobile-game-summary';
    const label=document.createElement('span');
    label.textContent=(picker.querySelector('#scoreSideGame')?.value||'Side Game')+' · $'+(wager?.value||readonly.textContent.match(/\$\s*\d+/)?.[0].replace(/\D/g,'')||'0')+' · Wager Set';
    const edit=document.createElement('button');
    edit.type='button';
    edit.className='secondary mobile-game-edit';
    edit.textContent='Edit';
    edit.setAttribute('aria-expanded','false');
    edit.addEventListener('click',()=>{
      const open=picker.classList.toggle('mobile-game-editing');
      edit.textContent=open?'Done':'Edit';
      edit.setAttribute('aria-expanded',String(open));
    });
    summary.append(label,edit);
    picker.prepend(summary);
  }
  const previous=render;
  render=function(){
    previous();
    // The Nassau and 40 Ball modules move the picker after rendering.
    setTimeout(enhance,0);
  };
  setTimeout(enhance,0);
})();
