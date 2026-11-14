/** Item Piles merchant adapter. Merchant transactions belong entirely to Item Piles. */
import {isItemPilesAvailable} from './item-piles.mjs';
import {priceItemForStock,pickMerchantStock} from './market-core.mjs';
const MOD='moonlighter-floor-forge';
export const MERCHANT_ICON='icons/svg/coins.svg';
function findMerchant(scene,merchantId){return scene?.tokens?.contents?.find(t=>t.flags?.[MOD]?.merchantId===merchantId)||null;}
/** Creates one merchant on the chosen scene. Never invents/credits currency or sales records. */
export async function createMarketMerchant(scene,{id,name,position,items,stockCount,market,markup=1}){
  if(!game?.user?.isGM)throw Error('Только ведущий может размещать торговцев.');
  if(!isItemPilesAvailable())throw Error('Требуются активные Item Piles и Item Piles: D&D 5e.');
  if(!scene?.id||!Number.isFinite(position?.x)||!Number.isFinite(position?.y))throw Error('Неверная сцена или позиция.');
  if(!Array.isArray(items)||!items.length)throw Error('Нет предметов для торговли.');
  const existing=findMerchant(scene,id);
  if(existing)return {tokenId:existing.id,tokenUuid:existing.uuid||null,alreadyPresent:true};
  const stock=pickMerchantStock(items,stockCount).map(item=>priceItemForStock(item,market,markup));
  if(!stock.length)throw Error('Нечего выставлять на продажу.');
  const payload={
    sceneId:scene.id,
    position:{x:position.x,y:position.y},
    tokenOverrides:{name,actorLink:false,width:1,height:1,texture:{src:MERCHANT_ICON},
      displayName:20,flags:{[MOD]:{merchantId:id,marketDay:market.day,shop:true}}},
    itemPileFlags:{enabled:true,type:game.itempiles.pile_types?.MERCHANT||'merchant',
      infiniteQuantity:false,infiniteCurrencies:true,purchaseOnly:false,
      merchantImage:MERCHANT_ICON},
    items:stock
  };
  const response=await game.itempiles.API.createItemPile(payload);
  const found=findMerchant(scene,id);
  const uuid=typeof response==='string'?response:response?.tokenUuid||found?.uuid||null;
  if(!uuid&&!found)throw Error('Item Piles не подтвердил появление торговца. Проверьте сцену на частично созданный токен.');
  const match=typeof uuid==='string'?uuid.match(/Scene\.([^\.]+)\.Token\.([^\.]+)/):null;
  return {tokenId:found?.id||(match?.[1]===scene.id?match[2]:null),tokenUuid:uuid,count:stock.length};
}
