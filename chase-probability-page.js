/* Combine live standings and Chase probabilities on one page. */
(() => {
  const standingsPage=board;
  board=function(){
    const standings=standingsPage();
    const forecast=`
      <section class="card">
        <div class="eyebrow">TOURNAMENT OUTLOOK</div>
        <h2 class="red">Chase for the Cup — Forecast</h2>
        <p>See each golfer’s current chance to win or finish in the money. The forecast updates automatically as scores are entered.</p>
      </section>
    `;
    return standings.replace(/<\/div>\s*$/,forecast+'</div>');
  };
})();
