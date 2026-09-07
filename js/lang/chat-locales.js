/**
 * Locale tables for reading WhatsApp exports.
 *
 * The parser recognises a *shape* (iOS bracket / Android dash) regardless of
 * language, but everything WhatsApp itself writes into the file — the
 * end-to-end-encryption notice, "image omitted", "this message was deleted",
 * the poll header — is localised. Those strings live here rather than in
 * `parser.js` so adding a language is a data change, not a code change.
 *
 * Coverage: FR, EN, ES, DE, PT, IT, NL, ID, TR.
 *
 * Matching is done with `includes` on a lower-cased line, so entries are
 * written lower-case and without leading/trailing punctuation. Keep them
 * *distinctive*: `'left'` on its own would match any English sentence
 * containing the word, so the group-event phrases keep enough context to stay
 * unambiguous.
 */

/** Authors WhatsApp uses for its own messages. */
export const SYSTEM_AUTHORS = ['Meta AI', 'WhatsApp'];

/**
 * Author-less notices: group lifecycle, encryption, security codes.
 * Matched against the whole line, lower-cased.
 */
export const SYSTEM_KEYWORDS = [
    // FR
    'a créé le groupe', 'vous a ajouté', 'a ajouté', "a changé l'icône",
    'les messages et les appels', 'a quitté le groupe', 'a été retiré',
    'a modifié le sujet', 'a rejoint en utilisant', 'le code de sécurité',
    'a changé le sujet', 'a remplacé le nom du groupe', 'a changé son numéro',
    'a épinglé un message', 'seuls les messages partagés avec @meta ai',
    "les messages sont générés par l'ia",
    // EN
    'messages to this chat', 'messages and calls are end-to-end',
    'created group', 'created this group', 'added you', 'changed the subject',
    'changed this group', 'left the group', 'was removed', 'joined using',
    'security code changed', 'changed their phone number', 'pinned a message',
    // ES
    'los mensajes y las llamadas', 'creó el grupo', 'añadió a', 'salió del grupo',
    'cambió el asunto', 'se unió usando', 'el código de seguridad',
    'cambió su número', 'fijó un mensaje',
    // DE
    'nachrichten und anrufe', 'hat die gruppe erstellt', 'hat dich hinzugefügt',
    'hat hinzugefügt', 'hat die gruppe verlassen', 'sicherheitsnummer',
    'hat das thema geändert', 'ist über einen einladungslink beigetreten',
    'hat eine nachricht angeheftet',
    // PT
    'as mensagens e as chamadas', 'criou o grupo', 'adicionou',
    'saiu do grupo', 'mudou o assunto', 'entrou usando', 'o código de segurança',
    'mudou o número de telefone', 'fixou uma mensagem',
    // IT
    'i messaggi e le chiamate', 'ha creato il gruppo', 'ha aggiunto',
    'è uscito dal gruppo', "ha cambiato l'oggetto", 'è entrato usando',
    'il codice di sicurezza', 'ha cambiato numero', 'ha fissato un messaggio',
    // NL
    'berichten en oproepen', 'heeft de groep gemaakt', 'heeft toegevoegd',
    'heeft de groep verlaten', 'de beveiligingscode', 'is lid geworden via',
    'heeft het onderwerp gewijzigd', 'heeft een bericht vastgezet',
    // ID
    'pesan dan panggilan', 'membuat grup', 'menambahkan anda',
    'keluar dari grup', 'mengubah subjek', 'bergabung menggunakan',
    'kode keamanan', 'mengganti nomor', 'menyematkan sebuah pesan',
    'telah dikeluarkan',
    // TR
    'mesajlar ve aramalar', 'grubu oluşturdu', 'sizi ekledi', 'kişisini ekledi',
    'gruptan ayrıldı', 'konuyu değiştirdi', 'davet bağlantısını kullanarak katıldı',
    'güvenlik kodu', 'telefon numarasını değiştirdi', 'bir mesajı sabitledi',
    'gruptan çıkarıldı',
];

/**
 * Placeholders left behind by a "without media" export, grouped by the media
 * type they stand for.
 *
 * Grouping them here is what lets `stats.js` bucket a Spanish or German export
 * correctly: it used to test two hard-coded FR/EN regexes, so every non-FR/EN
 * attachment counted towards the media total but landed in no bucket at all,
 * and the "Médias" slide showed a headline figure with an empty breakdown.
 *
 * The generic entries (`<médias omis>`) name no type and are listed under
 * `other`: they still count as media, they just cannot be attributed.
 */
export const MEDIA_BY_TYPE = {
    images: [
        'image absente', 'image omitted', 'imagen omitida', 'bild weggelassen',
        'imagem ocultada', 'immagine omessa', 'afbeelding weggelaten',
        'gambar tidak disertakan', 'görsel dahil edilmedi',
    ],
    gifs: [
        'gif retiré', 'gif omitted', 'gif omitido', 'gif weggelassen',
        'gif omessa', 'gif weggelaten',
        'gif tidak disertakan', 'gif dahil edilmedi',
    ],
    stickers: [
        'sticker omis', 'sticker omitted', 'sticker omitido', 'sticker weggelassen',
        'figurinha omitida', 'adesivo omesso', 'sticker weggelaten',
        'stiker tidak disertakan', 'çıkartma dahil edilmedi',
    ],
    videos: [
        'vidéo absente', 'video omitted', 'video omitido', 'video weggelassen',
        'vídeo omitido', 'video omesso', 'video weggelaten',
        'video tidak disertakan', 'video dahil edilmedi',
    ],
    audio: [
        'audio omis', 'audio omitted', 'audio omitido', 'audio weggelassen',
        'áudio ocultado', 'audio omesso', 'audio weggelaten',
        'audio tidak disertakan', 'ses dahil edilmedi',
    ],
    documents: [
        'document omis', 'document omitted', 'documento omitido',
        'dokument weggelassen', 'documento omesso', 'document weggelaten',
        'contact card omitted', 'fichier joint',
        'dokumen tidak disertakan', 'belge dahil edilmedi',
    ],
    other: [
        '<médias omis>', 'media omitted', 'multimedia omitido',
        '<mídia oculta>', '<media omessi>', '<media weggelaten>',
        '<media tidak disertakan>', '<medya dahil edilmedi>',
    ],
};

/** Flat list of every media placeholder, in no particular order. */
export const MEDIA_PATTERNS = Object.values(MEDIA_BY_TYPE).flat();

/** The "(edited)" marker WhatsApp appends in place. */
export const EDITED_PATTERNS = [
    '<ce message a été modifié>', '<this message was edited>',
    '<se editó este mensaje>', '<diese nachricht wurde bearbeitet>',
    '<esta mensagem foi editada>', '<questo messaggio è stato modificato>',
    '<dit bericht is bewerkt>',
    '<pesan ini diedit>', '<bu mesaj düzenlendi>',
];

/**
 * Tombstones for messages deleted after the fact.
 *
 * They used to be counted as ordinary messages: a chat where someone deleted
 * two hundred messages credited them with two hundred identical ones, which
 * skewed the ranking, the word cloud and the average length alike.
 */
export const DELETED_PATTERNS = [
    // FR
    'ce message a été supprimé', 'vous avez supprimé ce message',
    // EN
    'this message was deleted', 'you deleted this message',
    // ES
    'se eliminó este mensaje', 'eliminaste este mensaje',
    // DE
    'diese nachricht wurde gelöscht', 'du hast diese nachricht gelöscht',
    // PT
    'esta mensagem foi apagada', 'você apagou esta mensagem',
    // IT
    'questo messaggio è stato eliminato', 'hai eliminato questo messaggio',
    // NL
    'dit bericht is verwijderd', 'je hebt dit bericht verwijderd',
    // ID
    'pesan ini telah dihapus', 'anda menghapus pesan ini',
    // TR
    'bu mesaj silindi', 'bu mesajı sildiniz',
];

/**
 * Poll headers. A poll is exported as a multi-line block whose first line is
 * this header, so it is matched at the *start* of the message rather than
 * anywhere inside it.
 */
export const POLL_PREFIXES = [
    'sondage :', 'sondage:', 'poll:', 'encuesta:', 'umfrage:',
    'enquete:', 'enquete :', 'sondaggio:', 'peiling:',
    'jajak pendapat:', 'anket:',
];

/**
 * A reaction line: "<verb> ❤️ à ce message".
 *
 * The emoji group tolerates variation selectors and ZWJ sequences so a
 * multi-codepoint emoji (👨‍👩‍👧) is captured whole.
 */
export const REACTION_RE = new RegExp(
    '^(?:'
    + [
        'a réagi', 'a aimé',            // FR
        'reacted', 'liked',             // EN
        'reaccionó', 'le gustó',        // ES
        'hat reagiert',                 // DE
        'reagiu',                       // PT
        'ha reagito',                   // IT
        'reageerde',                    // NL
        'bereaksi', 'menyukai',         // ID
        'tepki verdi', 'beğendi',       // TR
    ].join('|')
    + ')\\s+((?:\\p{Extended_Pictographic}\\uFE0F?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)+)',
    'iu',
);
