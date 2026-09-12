/* Replace duplicative Chase standings with a probability-focused shell. */
(() => {
  chase=function(){
    return layout(`
      <section class="card">
        <div class="eyebrow">TOURNAMENT OUTLOOK</div>
        <h2 class="red">CHASE FOR THE CUP — WIN PROBABILITY</h2>
        <p>See each golfer’s current chance to win, with round-by-round Stableford performance.</p>
      </section>
    `);
  };
})();
