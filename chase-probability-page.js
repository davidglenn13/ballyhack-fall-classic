/* Combine live standings and Chase probabilities on one page. */
(() => {
  const standingsPage=board;
  board=function(){
    const standings=standingsPage();
    const forecast=`
      <section class="card">
        <div class="eyebrow">TOURNAMENT OUTLOOK</div>
        <h2 class="red">Chase for the Cup — Forecast</h2>
        <p>See each golfer’s current chance to win or finish in the money. Completed scores are fixed, and the remaining golf is simulated 15,000 times. “In the money” means finishing 1st, 2nd, or 3rd; ties at the cutoff count.</p>
      </section>
    `;
    return standings.replace(/<\/div>\s*$/,forecast+'</div>');
  };
})();
