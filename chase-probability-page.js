/* Combine live standings and Chase probabilities on one page. */
(() => {
  const standingsPage=board;
  board=function(){
    const standings=standingsPage();
    const private40=typeof active40Privacy==='function'&&active40Privacy();
    const forecast=private40?`
      <section class="card">
        <div class="eyebrow">TOURNAMENT OUTLOOK</div>
        <h2 class="red">Chase for the Cup — Forecast</h2>
        <div class="permission-note">Forecast is hidden while 40 Ball privacy is active. It will return when the round is complete.</div>
      </section>
    `:`
      <section class="card">
        <div class="eyebrow">TOURNAMENT OUTLOOK</div>
        <h2 class="red">Chase for the Cup — Forecast</h2>
        <p>Current chance to win or finish in the money. Completed scores are fixed; remaining golf is simulated 15,000 times. “In the money” means 1st, 2nd, or 3rd; cutoff ties count.</p>
      </section>
    `;
    return standings.replace(/<\/div>\s*$/,forecast+'</div>');
  };
})();
