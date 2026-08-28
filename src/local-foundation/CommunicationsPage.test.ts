import {describe,expect,it} from 'vitest';
import type {ChatPreference,OperationalRecord} from './model';
import {messageIsoDay,sharedMediaCategory,sortConversationsByPreference} from './communicationsUi';

function chat(id:string,updatedAt:string):OperationalRecord {
  return {id,moduleId:'chat',domain:'communications',trackingCode:id,title:id,description:'',status:'active',priority:'normal',companyId:'company',createdByActorId:'actor',createdByUserId:'user',updatedByActorId:'actor',version:1,payload:{conversationKind:'direct',memberUserIds:['user']},createdAt:updatedAt,updatedAt};
}

function preference(chatId:string,pinned:boolean):ChatPreference {
  return {id:`${chatId}:user`,chatId,userId:'user',companyId:'company',pinned,muted:false,version:1,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
}

describe('communications page helpers',()=>{
  it('sorts pinned conversations first and keeps recent order inside each group',()=>{
    const records=[chat('older','2026-08-25T10:00:00.000Z'),chat('newer','2026-08-27T10:00:00.000Z'),chat('pinned','2026-08-24T10:00:00.000Z')];
    expect(sortConversationsByPreference(records,[preference('pinned',true)],'user').map((item)=>item.id)).toEqual(['pinned','newer','older']);
    expect(records.map((item)=>item.id)).toEqual(['older','newer','pinned']);
  });

  it.each([
    [{kind:'file' as const,mimeType:'image/webp'},'image'],
    [{kind:'voice' as const,mimeType:'audio/ogg'},'audio'],
    [{kind:'file' as const,mimeType:'video/mp4'},'document'],
    [{kind:'file' as const,mimeType:'application/pdf'},'document'],
  ])('classifies shared media from MIME as %s', (attachment,expected)=>{
    expect(sharedMediaCategory(attachment)).toBe(expected);
  });

  it('uses Tehran calendar day at the UTC date boundary',()=>{
    expect(messageIsoDay('2026-08-26T20:31:00.000Z')).toBe('2026-08-27');
    expect(messageIsoDay('not-a-date')).toBe('');
  });
});
