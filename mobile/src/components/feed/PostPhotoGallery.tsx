import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageErrorEventData,
  type ImageLoadEventData,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { imageUrlForLogs, postImageUrl } from '../../features/posts/postDraft';
import { colors, fonts } from '../ui';

type Props = {
  displayHeight?: number;
  imageRefreshToken: number;
  imageUrls: string[];
};

type GalleryPage = {
  id: string;
  onClose: () => void;
  uri: string;
  width: number;
};

export function PostPhotoGallery({ displayHeight = 220, imageRefreshToken, imageUrls }: Props) {
  const resolvedUrls = useMemo(() => imageUrls.map(postImageUrl), [imageUrls]);
  const gallery = usePostPhotoGallery(resolvedUrls.length);

  return (
    <>
      <PostPhotoGrid
        displayHeight={displayHeight}
        imageRefreshToken={imageRefreshToken}
        imageUrls={resolvedUrls}
        onOpen={gallery.openPhoto}
      />
      <PostPhotoViewer
        imageRefreshToken={imageRefreshToken}
        imageUrls={resolvedUrls}
        key={gallery.viewerSession}
        onClose={gallery.close}
        selectedIndex={gallery.selectedIndex}
        setSelectedIndex={gallery.setSelectedFromScroll}
        visible={gallery.isOpen}
      />
    </>
  );
}

function PostPhotoGrid({
  displayHeight,
  imageRefreshToken,
  imageUrls,
  onOpen,
}: Props & { onOpen: (index: number) => void }) {
  if (imageUrls.length === 3) {
    return (
      <View style={[styles.photos, { height: displayHeight }]}>
        <PostPhotoTile
          count={imageUrls.length}
          imageRefreshToken={imageRefreshToken}
          index={0}
          onOpen={onOpen}
          style={styles.photoPrimary}
          uri={imageUrls[0]}
        />
        <View style={styles.photoColumn}>
          <PostPhotoTile
            count={imageUrls.length}
            imageRefreshToken={imageRefreshToken}
            index={1}
            onOpen={onOpen}
            style={styles.photoStacked}
            uri={imageUrls[1]}
          />
          <PostPhotoTile
            count={imageUrls.length}
            imageRefreshToken={imageRefreshToken}
            index={2}
            onOpen={onOpen}
            style={styles.photoStacked}
            uri={imageUrls[2]}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.photos, { height: displayHeight }, imageUrls.length === 4 && styles.photosWrapped]}>
      {imageUrls.map((uri, index) => (
        <PostPhotoTile
          count={imageUrls.length}
          imageRefreshToken={imageRefreshToken}
          index={index}
          key={`${uri}-${index}-${imageRefreshToken}`}
          onOpen={onOpen}
          style={imageUrls.length === 4 ? styles.photoQuarter : styles.photoEqual}
          uri={uri}
        />
      ))}
    </View>
  );
}

function PostPhotoTile({
  count,
  imageRefreshToken,
  index,
  onOpen,
  style,
  uri,
}: {
  count: number;
  imageRefreshToken: number;
  index: number;
  onOpen: (index: number) => void;
  style: StyleProp<ViewStyle>;
  uri: string;
}) {
  const open = usePhotoTileAction(index, onOpen);
  const photoLoad = usePhotoLoadState(uri, imageRefreshToken);

  return (
    <Pressable
      accessibilityHint="Opens the full-screen photo gallery"
      accessibilityLabel={`Open photo ${index + 1} of ${count}`}
      accessibilityRole="button"
      key={`${uri}-${imageRefreshToken}`}
      onPress={open}
      style={[styles.photoTile, style]}
    >
      {photoLoad.failed ? (
        <View accessibilityLabel="Photo unavailable" style={styles.photoFallback}>
          <Ionicons color={colors.muted} name="image-outline" size={26} />
          <Text style={styles.photoFallbackText}>Pull down to retry</Text>
        </View>
      ) : (
        <Image
          onError={photoLoad.markFailed}
          onLoad={photoLoad.markLoaded}
          onLoadEnd={photoLoad.markEnded}
          onLoadStart={photoLoad.markStarted}
          resizeMode="cover"
          source={{ uri }}
          style={styles.photo}
        />
      )}
      {count > 1 && index === 0 && (
        <View style={styles.photoCountBadge}>
          <Ionicons color="#FFFFFF" name="images" size={13} />
          <Text style={styles.photoCountText}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

function PostPhotoViewer({
  imageRefreshToken,
  imageUrls,
  onClose,
  selectedIndex,
  setSelectedIndex,
  visible,
}: {
  imageRefreshToken: number;
  imageUrls: string[];
  onClose: () => void;
  selectedIndex: number;
  setSelectedIndex: (event: NativeSyntheticEvent<NativeScrollEvent>, width: number) => void;
  visible: boolean;
}) {
  const { width } = useWindowDimensions();
  const pages = useMemo(
    () => imageUrls.map((uri, index) => ({
      id: `${uri}-${index}-${imageRefreshToken}`,
      onClose,
      uri,
      width,
    })),
    [imageRefreshToken, imageUrls, onClose, width],
  );
  const viewer = usePhotoViewerLayout(width, setSelectedIndex);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
      visible={visible}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.viewer}>
        {visible && <StatusBar style="light" />}
        <Pressable
          accessibilityLabel="Close photo gallery"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.viewerBackdrop}
        />
        <FlatList
          data={pages}
          getItemLayout={viewer.getItemLayout}
          horizontal
          initialNumToRender={pages.length}
          initialScrollIndex={selectedIndex}
          key={String(width)}
          keyExtractor={galleryPageKey}
          onMomentumScrollEnd={viewer.onMomentumScrollEnd}
          pagingEnabled
          renderItem={renderGalleryPage}
          showsHorizontalScrollIndicator={false}
          style={styles.viewerList}
        />
        <View
          accessibilityLabel={`Photo ${selectedIndex + 1} of ${imageUrls.length}`}
          pointerEvents="none"
          style={styles.pageDots}
        >
          {imageUrls.map((uri, index) => (
            <View
              key={`${uri}-${index}`}
              style={[styles.pageDot, index === selectedIndex && styles.pageDotActive]}
            />
          ))}
        </View>
        <View pointerEvents="none" style={styles.viewerCounterOverlay}>
          <Text style={styles.viewerCounter}>{selectedIndex + 1} / {imageUrls.length}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function renderGalleryPage({ item }: ListRenderItemInfo<GalleryPage>) {
  return <GalleryImagePage page={item} />;
}

function GalleryImagePage({ page }: { page: GalleryPage }) {
  const imageLayout = useContainedImageLayout();
  const keepOpen = useKeepGalleryOpen();

  return (
    <Pressable
      accessibilityHint="Closes the photo gallery"
      accessibilityLabel="Close photo gallery"
      accessibilityRole="button"
      onLayout={imageLayout.measureContainer}
      onPress={page.onClose}
      style={[styles.viewerPage, { width: page.width }]}
    >
      {!imageLayout.failed && (
        <Pressable
          accessible={false}
          onPress={keepOpen}
          style={[styles.viewerImageHitArea, imageLayout.imageSize]}
        >
          <Image
            onError={imageLayout.markFailed}
            onLoad={imageLayout.measureImage}
            resizeMode="contain"
            source={{ uri: page.uri }}
            style={styles.viewerImage}
          />
        </Pressable>
      )}
    </Pressable>
  );
}

function galleryPageKey(item: GalleryPage) {
  return item.id;
}

function usePostPhotoGallery(photoCount: number) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewerSession, setViewerSession] = useState(0);
  const openPhoto = useCallback((index: number) => {
    setSelectedIndex(index);
    setViewerSession((session) => session + 1);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);
  const setSelectedFromScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>, width: number) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setSelectedIndex(Math.max(0, Math.min(photoCount - 1, nextIndex)));
  }, [photoCount]);

  return { close, isOpen, openPhoto, selectedIndex, setSelectedFromScroll, viewerSession };
}

function usePhotoTileAction(index: number, onOpen: (index: number) => void) {
  return useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
    onOpen(index);
  }, [index, onOpen]);
}

function useKeepGalleryOpen() {
  return useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);
}

function useContainedImageLayout() {
  const [containerSize, setContainerSize] = useState({ height: 0, width: 0 });
  const [failed, setFailed] = useState(false);
  const [sourceSize, setSourceSize] = useState({ height: 0, width: 0 });
  const measureContainer = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setContainerSize({ height, width });
  }, []);
  const measureImage = useCallback((event: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { height, width } = event.nativeEvent.source;
    setSourceSize({ height, width });
  }, []);
  const markFailed = useCallback(() => {
    setFailed(true);
  }, []);
  const imageSize = useMemo(
    () => containedImageSize(containerSize, sourceSize),
    [containerSize, sourceSize],
  );

  return { failed, imageSize, markFailed, measureContainer, measureImage };
}

function containedImageSize(
  container: { height: number; width: number },
  source: { height: number; width: number },
) {
  if (container.height === 0 || container.width === 0 || source.height === 0 || source.width === 0) {
    return { height: '100%' as const, width: '100%' as const };
  }

  const scale = Math.min(container.width / source.width, container.height / source.height);
  return { height: source.height * scale, width: source.width * scale };
}

function usePhotoViewerLayout(
  width: number,
  setSelectedIndex: (event: NativeSyntheticEvent<NativeScrollEvent>, width: number) => void,
) {
  const getItemLayout = useCallback((_data: ArrayLike<GalleryPage> | null | undefined, index: number) => ({
    index,
    length: width,
    offset: width * index,
  }), [width]);
  const onMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setSelectedIndex(event, width);
  }, [setSelectedIndex, width]);

  return { getItemLayout, onMomentumScrollEnd };
}

function usePhotoLoadState(uri: string, imageRefreshToken: number) {
  const [failed, setFailed] = useState(false);
  const safeUri = imageUrlForLogs(uri);

  useEffect(() => {
    setFailed(false);
    if (__DEV__) console.info('[Friendminton:image] render', { uri: safeUri });
  }, [imageRefreshToken, safeUri, uri]);

  const markStarted = useCallback(() => {
    if (__DEV__) console.info('[Friendminton:image] load start', { uri: safeUri });
  }, [safeUri]);

  const markLoaded = useCallback((event: NativeSyntheticEvent<ImageLoadEventData>) => {
    if (__DEV__) {
      console.info('[Friendminton:image] load success', {
        height: event.nativeEvent.source.height,
        uri: safeUri,
        width: event.nativeEvent.source.width,
      });
    }
  }, [safeUri]);

  const markFailed = useCallback((event: NativeSyntheticEvent<ImageErrorEventData>) => {
    if (__DEV__) {
      console.warn('[Friendminton:image] load error', {
        error: event.nativeEvent.error,
        uri: safeUri,
      });
    }
    setFailed(true);
  }, [safeUri]);

  const markEnded = useCallback(() => {
    if (__DEV__) console.info('[Friendminton:image] load end', { uri: safeUri });
  }, [safeUri]);

  return { failed, markEnded, markFailed, markLoaded, markStarted };
}

const styles = StyleSheet.create({
  photos: {
    flexDirection: 'row',
    gap: 3,
    overflow: 'hidden',
    width: '100%',
  },
  photosWrapped: { flexWrap: 'wrap' },
  photoTile: { backgroundColor: colors.primarySoft, overflow: 'hidden' },
  photo: { height: '100%', width: '100%' },
  photoEqual: { flex: 1 },
  photoPrimary: { flex: 2 },
  photoColumn: { flex: 1, gap: 3 },
  photoStacked: { flex: 1 },
  photoQuarter: { flexGrow: 1, height: '49%', width: '49%' },
  photoFallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  photoFallbackText: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  photoCountBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: 'absolute',
    right: 8,
    top: 8,
  },
  photoCountText: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 12,
    fontWeight: '900',
  },
  viewer: { backgroundColor: '#050505', flex: 1 },
  viewerBackdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  viewerCounterOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 16,
    left: 0,
    marginHorizontal: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    right: 0,
    top: 12,
    width: 64,
    zIndex: 10,
  },
  viewerCounter: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 15,
    fontWeight: '900',
  },
  viewerList: { flex: 1 },
  viewerPage: { alignItems: 'center', height: '100%', justifyContent: 'center' },
  viewerImageHitArea: { alignItems: 'center', justifyContent: 'center' },
  viewerImage: { height: '100%', width: '100%' },
  pageDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    bottom: 18,
    left: 0,
    paddingHorizontal: 20,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  pageDot: { backgroundColor: '#5F5F5F', borderRadius: 4, height: 7, width: 7 },
  pageDotActive: { backgroundColor: '#FFFFFF', width: 18 },
});
