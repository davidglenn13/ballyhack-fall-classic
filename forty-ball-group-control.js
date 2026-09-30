/* 40 Ball is a round-wide game controlled only from First Group. */
(() => {
  const FORTY='40 Ball';

  function apply(){
    const sel=document.querySelector('#scoreSideGame');
    if(!sel)return;
    const g=+(sessionStorage.group||1);
    const opt=[...sel.options].find(o=>o.value===FORTY||o.textContent.trim().startsWith(FORTY));
    if(!opt)return;
    opt.value=FORTY;
    if(g===2){
      opt.textContent='40 Ball — First Group Must Select';
      opt.disabled=true;
    }else{
      opt.textContent=FORTY;
      opt.disabled=false;
    }
  }

  function applyGroupPrivacy(){
    const sel=document.querySelector('#groupSel');
    if(!sel)return;
    [...sel.options].forEach(opt=>{
      const g=+opt.value;
      opt.disabled=false;
      opt.textContent=g===1?'First Group':'Second Group';
    });
  }

  document.addEventListener('change',e=>{
    const sel=e.target.closest?.('#scoreSideGame');
    if(!sel)return;
    const g=+(sessionStorage.group||1);
    if(g===2 && sel.value===FORTY){
      e.preventDefault();
      e.stopImmediatePropagation();
      alert('40 Ball must be selected from the First Group.');
      render();
    }
  },true);

  const prior=render;
  render=function(){ prior(); setTimeout(()=>{apply();applyGroupPrivacy();},0); };
  setTimeout(()=>{apply();applyGroupPrivacy();},0);
})();
