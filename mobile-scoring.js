/* Keep setup prominent until the wager is saved, then prioritize score entry. */
(() => {
  function restoreSetupToTop(picker){
    const card=document.querySelector('.scoring-card');
    if(!picker||!card)return;
    picker.classList.remove('side-game-picker-detached','mobile-game-saved','mobile-game-editing');
    picker.querySelector('.mobile-game-summary')?.remove();
    const next=picker.querySelector('.wager-next');
    if(next)next.textContent='Next step: enter the wager for this side game';
    const hole=card.querySelector('.hole-focus');
    if(hole)card.insertBefore(picker,hole);
    const tracker=document.querySelector('.forty-ball-beta-note');
    if(tracker&&picker.nextElementSibling!==tracker){
      picker.insertAdjacentElement('afterend',tracker);
    }
  }

  function enhance(){
    const card=document.querySelector('.scoring-card');
    if(!card)return;
    const head=card.querySelector('.scoring-head');
    const sync=card.querySelector('.sync-panel');
    if(head&&sync){
      head.querySelector('.score-signed-in')?.remove();
      head.appendChild(sync);
    }

    const picker=document.querySelector('.side-game-picker-detached')||card.querySelector('.side-game-picker');
    if(!picker)return;
    const game=picker.querySelector('#scoreSideGame')?.value||'None';
    const wager=game==='40 Ball'
      ?picker.querySelector('[data-fbw-wager]')
      :game==='None'
        ?null
        :picker.querySelector('[data-nlp-wager]');
    const readonly=game==='40 Ball'?picker.querySelector('.fbw-readonly'):null;
    const amount=Number(wager?.value||0);
    const readonlyAmount=readonly&&/\$\s*\d+/.test(readonly.textContent);
    const saved=game!=='None'&&(amount>0||readonlyAmount);

    if(!saved){
      restoreSetupToTop(picker);
      return;
    }

    /* Once setup is complete, keep Game + Wager beneath the Press Bet section. */
    const pressCard=document.querySelector('.nlp-card');
    if(pressCard&&picker.previousElementSibling!==pressCard){
      pressCard.insertAdjacentElement('afterend',picker);
    }

    const tracker=document.querySelector('.forty-ball-beta-note');
    if(tracker){
      const review=card.querySelector('.score-review');
      if(review){
        card.insertBefore(tracker,review);
      }else if(picker.nextElementSibling!==tracker){
        picker.insertAdjacentElement('afterend',tracker);
      }
    }

    picker.classList.add('mobile-game-saved');
    if(picker.querySelector('.mobile-game-summary'))return;
    const summary=document.createElement('div');
    summary.className='mobile-game-summary';
    const label=document.createElement('span');
    label.textContent=game+' · $'+(wager?.value||readonly.textContent.match(/\$\s*\d+/)?.[0].replace(/\D/g,'')||'0')+' · Wager Set';
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

  function resync(){ setTimeout(enhance,0); }
  // Do not collapse/move the wager panel while the golfer is still typing.
  // Wait for the wager field to commit (change/blur) before treating setup as complete.
  document.addEventListener('change',e=>{
    if(e.target.matches?.('#scoreSideGame, [data-nlp-wager], [data-fbw-wager]'))resync();
  });

  const previous=render;
  render=function(){
    previous();
    // The Nassau and 40 Ball modules move the picker after rendering.
    resync();
  };
  resync();
})();
